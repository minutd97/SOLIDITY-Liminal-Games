// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SpiritToken} from "./SpiritToken.sol";

import "hardhat/console.sol";

interface IV4Hook {
    function latestSqrtPriceX96(bytes32 poolId) external view returns (uint160);
}

interface IChainlinkPriceFeed {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

contract SpiritTokenFactory is Ownable {
    SpiritToken public immutable spirit;
    IERC20 public immutable limToken;
    IV4Hook public immutable v4Hook;
    bytes32 public immutable v4PoolId;
    IChainlinkPriceFeed public immutable ethUsdOracle;

    uint256 public redeemFee; // basis points (100 = 1%)

    uint256 public publicProtocolReserve;
    uint256 public collectedProtocolFees;

    uint256 public totalSpiritMinted;
    uint256 public totalSpiritBurned;

    event RedeemFeeUpdated(uint256 newFee);
    event Minted(address indexed user, uint256 limIn, uint256 spiritOut);
    event Redeemed(address indexed user, uint256 spiritIn, uint256 limOut);
    event PublicReserveDeposit(address indexed sender, uint256 amount);
    event ProtocolFeesCollected(address indexed collector, uint256 amount);

    constructor(
        address _spiritToken,
        address _limToken,
        uint256 _redeemFee,
        address _v4Hook,
        bytes32 _v4PoolId,
        address _ethUsdFeed
    ) Ownable(msg.sender) {
        require(_spiritToken != address(0), "Invalid SPIRIT token");
        require(_limToken != address(0), "Invalid LIM token");
        require(_v4Hook != address(0), "Invalid hook");
        require(_v4PoolId != bytes32(0), "Invalid poolId");

        spirit = SpiritToken(_spiritToken);
        limToken = IERC20(_limToken);
        redeemFee = _redeemFee;
        v4Hook = IV4Hook(_v4Hook);
        v4PoolId = _v4PoolId;
        ethUsdOracle = IChainlinkPriceFeed(_ethUsdFeed);
    }

    function setRedeemFee(uint256 newFee) external onlyOwner {
        require(newFee <= 500, "Max 5%");
        redeemFee = newFee;
        emit RedeemFeeUpdated(newFee);
    }

    /// @notice Mint SPIRIT 1:1 for LIM
    function mintSpirit(uint256 limAmount) external {
       require(limAmount > 0, "Invalid LIM amount");

       // pull limAmount LIM from user
       require(limToken.transferFrom(msg.sender, address(this), limAmount), "LIM transfer failed");
       publicProtocolReserve += limAmount;
       totalSpiritMinted += limAmount;

       // mint exactly the same amount of SPIRIT
       spirit.mint(msg.sender, limAmount);
       emit Minted(msg.sender, limAmount, limAmount);
    }

    /// @notice Redeem SPIRIT 1:1 for LIM, minus fee
    function redeemSpirit(uint256 spiritAmount) external {
        require(spiritAmount > 0, "Nothing to redeem");
  
        // compute fee on the 1:1 LIM redemption
        uint256 fee = (spiritAmount * redeemFee) / 10000;
        uint256 payout = spiritAmount - fee;
  
        // update reserves & fees
        publicProtocolReserve -= spiritAmount;
        collectedProtocolFees += fee;
        totalSpiritBurned += spiritAmount;
  
        // burn the SPIRIT, then pay out LIM
        spirit.burnFrom(msg.sender, spiritAmount);
        require(limToken.transfer(msg.sender, payout), "LIM transfer failed");
        emit Redeemed(msg.sender, spiritAmount, payout);
    }

    function collectProtocolFees() external onlyOwner {
        require(collectedProtocolFees > 0, "No fees to withdraw");
        uint256 amount = collectedProtocolFees;
        collectedProtocolFees = 0;
        require(limToken.transfer(msg.sender, amount), "LIM transfer failed");
        emit ProtocolFeesCollected(msg.sender, amount);
    }

    // Emergency only
    function depositToPublicReserve(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be positive");
        require(limToken.transferFrom(msg.sender, address(this), amount), "LIM transfer failed");
        publicProtocolReserve += amount;
        emit PublicReserveDeposit(msg.sender, amount);
    }

    /// @notice How many LIM are needed to buy `usdAmount` USD
    /// @param usdAmount whole dollars (e.g. 30 for $30)
    function getRequiredLIMforUSD(uint256 usdAmount) public view returns (uint256) {
        require(usdAmount > 0, "Invalid amount");

        // 1) Raw LIM per ETH (no scaling)
        uint160 sqrtPriceX96 = v4Hook.latestSqrtPriceX96(v4PoolId);
        uint256 rawLIMperETH = (uint256(sqrtPriceX96) * uint256(sqrtPriceX96)) >> 192;
        require(rawLIMperETH > 0, "Invalid price");
        //console.log("rawLIMperETH:", rawLIMperETH);

        // 2) ETH price in USD (Chainlink, 8 decimals)
        (, int256 answer,,,) = ethUsdOracle.latestRoundData();
        require(answer > 0, "Invalid ETH price");
        uint256 ethUsd8 = uint256(answer);
        //console.log("ethUsd8:", ethUsd8);

        // 3) USD per LIM, scaled 8 decimals
        //    = (USD per ETH) / (LIM per ETH)
        uint256 priceLIMinUSD_8 = ethUsd8 / rawLIMperETH;
        //console.log("priceLIMinUSD_8:", priceLIMinUSD_8);

        // 4) How many LIM to cover `usdAmount` dollars?
        //    usdAmount * 1e8 => USD scaled to 8 decimals
        uint256 usdScaled8 = usdAmount * 1e8;
        //console.log("usdScaled8:", usdScaled8);

        //    LIM_needed = (usdScaled8 * 1e18) / priceLIMinUSD_8
        uint256 limNeeded = (usdScaled8 * 1e18) / priceLIMinUSD_8;
        //console.log("limNeeded:", limNeeded);

        return limNeeded;
    }

/// @notice How many whole LIM *wei* are needed to buy `usdAmount` USD:
///         - reverts if price lookup yields zero
///         - if the true needed amount is non-zero but < 1 LIM, returns 1 LIM (1e18 wei)
///         - otherwise floors to whole LIM tokens
function getRequiredWholeLIMforUSD(uint256 usdAmount) external view returns (uint256) {
    uint256 rawWei = getRequiredLIMforUSD(usdAmount);  // already in wei

    // revert if something went wrong (e.g. no price, usdAmount==0)
    require(rawWei > 0, "Invalid LIM amount");

    uint256 ONE_TOKEN = 1e18;

    // bump any non-zero <1 LIM up to exactly 1 LIM
    if (rawWei < ONE_TOKEN) {
        return ONE_TOKEN;
    }

    // otherwise floor down to whole tokens (in wei)
    return (rawWei / ONE_TOKEN) * ONE_TOKEN;
}

}

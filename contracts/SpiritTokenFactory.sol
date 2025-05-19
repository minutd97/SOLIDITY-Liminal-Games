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

    function mintSpirit(uint256 spiritAmount) external {
        require(spiritAmount > 0, "Invalid SPIRIT amount");
        uint256 requiredLIM = getRequiredLIMForSpirit(spiritAmount);

        require(
            limToken.transferFrom(msg.sender, address(this), requiredLIM),
            "LIM transfer failed"
        );
        publicProtocolReserve += requiredLIM;
        totalSpiritMinted += spiritAmount;

        spirit.mint(msg.sender, spiritAmount);
        emit Minted(msg.sender, requiredLIM, spiritAmount);
    }

    function redeemSpirit(uint256 amount) external {
        require(amount > 0, "Nothing to redeem");
        uint256 limAmount = getRequiredLIMForSpirit(amount);
        uint256 fee = (limAmount * redeemFee) / 10000;
        uint256 payout = limAmount - fee;

        require(
            limToken.balanceOf(address(this)) >= payout,
            "Insufficient LIM in reserve"
        );

        publicProtocolReserve -= limAmount;
        collectedProtocolFees += fee;
        totalSpiritBurned += amount;

        spirit.burnFrom(msg.sender, amount);
        require(
            limToken.transfer(msg.sender, payout),
            "LIM transfer failed"
        );
        emit Redeemed(msg.sender, amount, payout);
    }

    function depositToPublicReserve(uint256 amount) external {
        require(amount > 0, "Amount must be positive");
        require(
            limToken.transferFrom(msg.sender, address(this), amount),
            "LIM transfer failed"
        );
        publicProtocolReserve += amount;
        emit PublicReserveDeposit(msg.sender, amount);
    }

    function collectProtocolFees() external onlyOwner {
        require(collectedProtocolFees > 0, "No fees to withdraw");
        uint256 amount = collectedProtocolFees;
        collectedProtocolFees = 0;

        require(
            limToken.transfer(msg.sender, amount),
            "LIM transfer failed"
        );
        emit ProtocolFeesCollected(msg.sender, amount);
    }

    /// @notice Calculates the required LIM to mint a given amount of SPIRIT using live pool price.
    function getRequiredLIMForSpirit(uint256 spiritAmount) public view returns (uint256) {
        require(spiritAmount > 0, "Invalid SPIRIT amount");

        uint160 sqrtPriceX96 = v4Hook.latestSqrtPriceX96(v4PoolId);
        require(sqrtPriceX96 > 0, "Pool not initialized");

        // LIM per ETH (token1/token0)
        uint256 limPerETH = (uint256(sqrtPriceX96) * uint256(sqrtPriceX96)) >> 192;
        require(limPerETH > 0, "Invalid price");

        // Invert to get ETH per LIM, then calculate required LIM
        // requiredLIM = spiritAmount * ETH value of 1 SPIRIT / (ETH per LIM)
        uint256 ethPerLIM = (1e36) / limPerETH; // scale to 18 decimals
        return (spiritAmount * ethPerLIM) / 1e18;
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



}

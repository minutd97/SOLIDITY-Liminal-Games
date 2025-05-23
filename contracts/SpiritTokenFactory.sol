// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SpiritToken} from "./SpiritToken.sol";

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

/// @title SpiritTokenFactory
/// @notice Enables minting and redeeming SPIRIT tokens for LIM tokens at a 1:1 rate.
///         Also calculates LIM needed to match USD value using on-chain pricing.
contract SpiritTokenFactory is Ownable, ReentrancyGuard {
    SpiritToken public immutable spirit; // The SPIRIT token instance
    IERC20 public immutable limToken; // The LIM token used for minting/redemption
    IV4Hook public immutable v4Hook; // Hook to get on-chain LIM/ETH price from Uniswap V4
    bytes32 public immutable v4PoolId; // The Uniswap V4 pool identifier
    IChainlinkPriceFeed public immutable ethUsdOracle; // Chainlink ETH/USD oracle

    uint256 public redeemFee; // Redemption fee in basis points (100 = 1%)

    uint256 public publicProtocolReserve; // Total LIM reserve backing SPIRIT minting
    uint256 public collectedProtocolFees; // Accumulated LIM from redemption fees

    uint256 public totalSpiritMinted; // Total SPIRIT tokens minted
    uint256 public totalSpiritBurned; // Total SPIRIT tokens burned

    event RedeemFeeUpdated(uint256 newFee);
    event Minted(address indexed user, uint256 limIn, uint256 spiritOut);
    event Redeemed(address indexed user, uint256 spiritIn, uint256 limOut);
    event PublicReserveDeposit(address indexed sender, uint256 amount);
    event ProtocolFeesCollected(address indexed collector, uint256 amount);

    /// @notice Initializes the factory with token addresses, Uniswap V4 pool, and Chainlink oracle.
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
        require(_ethUsdFeed != address(0), "Invalid ETH/USD feed");

        spirit = SpiritToken(_spiritToken);
        limToken = IERC20(_limToken);
        redeemFee = _redeemFee;
        v4Hook = IV4Hook(_v4Hook);
        v4PoolId = _v4PoolId;
        ethUsdOracle = IChainlinkPriceFeed(_ethUsdFeed);
    }

    /// @notice Updates the redeem fee (max 5%)
    function setRedeemFee(uint256 newFee) external onlyOwner {
        require(newFee <= 500, "Max 5%");
        redeemFee = newFee;
        emit RedeemFeeUpdated(newFee);
    }

    /// @notice Mints SPIRIT tokens 1:1 by locking LIM
    function mintSpirit(uint256 limAmount) external nonReentrant {
       require(limAmount > 0, "Invalid LIM amount");

       // pull limAmount LIM from user
       require(limToken.transferFrom(msg.sender, address(this), limAmount), "LIM transfer failed");
       publicProtocolReserve += limAmount;
       totalSpiritMinted += limAmount;

       // mint exactly the same amount of SPIRIT
       spirit.mint(msg.sender, limAmount);
       emit Minted(msg.sender, limAmount, limAmount);
    }

    /// @notice Redeems SPIRIT tokens for LIM minus the redemption fee
    function redeemSpirit(uint256 spiritAmount) external nonReentrant {
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

    /// @notice Allows the owner to collect accumulated protocol fees (in LIM)
    function collectProtocolFees() external onlyOwner {
        require(collectedProtocolFees > 0, "No fees to withdraw");
        uint256 amount = collectedProtocolFees;
        collectedProtocolFees = 0;
        require(limToken.transfer(msg.sender, amount), "LIM transfer failed");
        emit ProtocolFeesCollected(msg.sender, amount);
    }

    /// @notice Owner can deposit LIM into the reserve manually (emergency only)
    function depositToPublicReserve(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be positive");
        require(limToken.transferFrom(msg.sender, address(this), amount), "LIM transfer failed");
        publicProtocolReserve += amount;
        emit PublicReserveDeposit(msg.sender, amount);
    }

    /// @notice Returns the exact LIM (in wei) needed to buy a given USD amount using current price
    function getRequiredLIMforUSD(uint256 usdAmount) public view returns (uint256) {
        require(usdAmount > 0, "Invalid amount");

        // Raw LIM per ETH (no scaling)
        uint160 sqrtPriceX96 = v4Hook.latestSqrtPriceX96(v4PoolId);
        uint256 rawLIMperETH = (uint256(sqrtPriceX96) * uint256(sqrtPriceX96)) >> 192;
        require(rawLIMperETH > 0, "Invalid price");

        // ETH price in USD (Chainlink, 8 decimals)
        (, int256 answer,,,) = ethUsdOracle.latestRoundData();
        require(answer > 0, "Invalid ETH price");
        uint256 ethUsd8 = uint256(answer);

        // USD per LIM, scaled 8 decimals
        uint256 priceLIMinUSD_8 = ethUsd8 / rawLIMperETH;

        // How many LIM to cover `usdAmount` dollars?
        uint256 usdScaled8 = usdAmount * 1e8;

        uint256 limNeeded = (usdScaled8 * 1e18) / priceLIMinUSD_8;
        return limNeeded;
    }

    /// @notice Returns the whole-token LIM (in wei) needed for USD value, with special rounding rules
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

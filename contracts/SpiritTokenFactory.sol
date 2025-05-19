// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SpiritToken} from "./SpiritToken.sol";

/**
 * @title Spirit Token Factory
 * @notice Users mint SPIRIT by supplying LIM, and can redeem SPIRIT for LIM at a fixed peg rate (minus fee).
 */
contract SpiritTokenFactory is Ownable {
    SpiritToken public immutable spirit; // SPIRIT token instance
    IERC20 public immutable limToken;    // Liminal Token (LIM) instance
    uint256 public pegRate;              // LIM-to-SPIRIT peg rate (LIM wei per 1 SPIRIT)
    uint256 public redeemFee;            // Redemption fee in basis points (e.g. 100 = 1%)

    uint256 public publicProtocolReserve; // LIM reserve in the contract
    uint256 public collectedProtocolFees; // LIM fees collected from redemptions

    uint256 public totalSpiritMinted;
    uint256 public totalSpiritBurned;

    event PegRateUpdated(uint256 newRate);
    event RedeemFeeUpdated(uint256 newFee);
    event Minted(address indexed user, uint256 limIn, uint256 spiritOut);
    event Redeemed(address indexed user, uint256 spiritIn, uint256 limOut);
    event PublicReserveDeposit(address indexed sender, uint256 amount);
    event ProtocolFeesCollected(address indexed collector, uint256 amount);

    constructor(
        address _spiritToken,
        address _limToken,
        uint256 _pegRate,
        uint256 _redeemFee
    ) Ownable(msg.sender) {
        require(_spiritToken != address(0), "Invalid SPIRIT token");
        require(_limToken != address(0), "Invalid LIM token");
        spirit = SpiritToken(_spiritToken);
        limToken = IERC20(_limToken);
        pegRate = _pegRate;
        redeemFee = _redeemFee;
    }

    function setPegRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "Rate must be positive");
        pegRate = newRate;
        emit PegRateUpdated(newRate);
    }

    function setRedeemFee(uint256 newFee) external onlyOwner {
        require(newFee <= 500, "Max 5%");
        redeemFee = newFee;
        emit RedeemFeeUpdated(newFee);
    }

    /// @notice Mints SPIRIT in exchange for LIM tokens
    function mintSpirit(uint256 spiritAmount) external {
        require(spiritAmount > 0, "Invalid SPIRIT amount");
        uint256 requiredLIM = getRequiredLIMForSpirit(spiritAmount);

        // Transfer LIM from user to this contract
        require(
            limToken.transferFrom(msg.sender, address(this), requiredLIM),
            "LIM transfer failed"
        );
        publicProtocolReserve += requiredLIM;
        totalSpiritMinted += spiritAmount;

        spirit.mint(msg.sender, spiritAmount);
        emit Minted(msg.sender, requiredLIM, spiritAmount);
    }

    /// @notice Redeems SPIRIT for LIM, minus fee
    function redeemSpirit(uint256 amount) external {
        require(amount > 0, "Nothing to redeem");
        uint256 limAmount = (amount * pegRate) / 1e18;
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

    /// @notice Deposit LIM into the public reserve
    function depositToPublicReserve(uint256 amount) external {
        require(amount > 0, "Amount must be positive");
        require(
            limToken.transferFrom(msg.sender, address(this), amount),
            "LIM transfer failed"
        );
        publicProtocolReserve += amount;
        emit PublicReserveDeposit(msg.sender, amount);
    }

    /// @notice Collect protocol fees (LIM) accrued from redemptions
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

    /// @notice Calculates the required LIM to mint a given amount of SPIRIT
    function getRequiredLIMForSpirit(uint256 spiritAmount) public view returns (uint256 limCost) {
        require(spiritAmount > 0, "Invalid SPIRIT amount");
        limCost = (spiritAmount * pegRate) / 1e18;
    }
}
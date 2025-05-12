// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SpiritToken} from "./SpiritToken.sol";

/**
 * @title Spirit Token Factory
 * @notice This contract allows users to mint and redeem SPIRIT tokens at a fixed peg rate in ETH,
 *         while applying a fixed redemption fee. It manages a public reserve pool and tracks collected fees.
 *         Only the contract owner can adjust rates and collect protocol fees.
 */
contract SpiritTokenFactory is Ownable {
    SpiritToken public immutable spirit; //The SPIRIT token instance
    uint256 public pegRate; // ETH-to-SPIRIT peg rate (wei per SPIRIT, e.g. 0.00004 ETH = 40000000000000 wei)
    uint256 public redeemFee; // Redemption fee in basis points (e.g. 100 = 1%)

    uint256 public publicProtocolReserve; // Total ETH in the public reserve pool
    uint256 public collectedProtocolFees; // Total fees collected from redemptions

    uint256 public totalSpiritMinted; // Total SPIRIT minted via this contract
    uint256 public totalSpiritBurned; // Total SPIRIT redeemed (burned) via this contract

    event PegRateUpdated(uint256 newRate);
    event RedeemFeeUpdated(uint256 newFee);
    event Minted(address indexed user, uint256 ethIn, uint256 spiritOut);
    event Redeemed(address indexed user, uint256 spiritIn, uint256 ethOut);
    event PublicReserveDeposit(address indexed sender, uint256 amount);
    event ProtocolFeesCollected(address indexed collector, uint256 amount);

    /// @notice Initializes the contract with SPIRIT token address, peg rate, and redeem fee
    constructor(address _spiritToken, uint256 _pegRate, uint256 _redeemFee) Ownable(msg.sender) {
        require(_spiritToken != address(0), "Invalid token address");
        spirit = SpiritToken(_spiritToken);
        pegRate = _pegRate;
        redeemFee = _redeemFee;
    }

    /// @notice Updates the ETH-to-SPIRIT peg rate
    function setPegRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "Rate must be positive");
        pegRate = newRate;
        emit PegRateUpdated(newRate);
    }

    /// @notice Updates the redemption fee rate
    function setRedeemFee(uint256 newFee) external onlyOwner {
        require(newFee <= 500, "Max 5%");
        redeemFee = newFee;
        emit RedeemFeeUpdated(newFee);
    }

    /// @notice Mints SPIRIT tokens in exchange for ETH sent
    function mintSpirit() external payable {
        require(msg.value > 0, "Send ETH to mint");
        uint256 amountToMint = msg.value * 1e18 / pegRate;
        publicProtocolReserve += msg.value;
        totalSpiritMinted += amountToMint;
        
        spirit.mint(msg.sender, amountToMint);
        emit Minted(msg.sender, msg.value, amountToMint);
    }

    /// @notice Redeems SPIRIT tokens for ETH minus redemption fee
    function redeemSpirit(uint256 amount) external {
        require(amount > 0, "Nothing to redeem");
        uint256 ethAmount = amount * pegRate / 1e18;
        uint256 fee = (ethAmount * redeemFee) / 10000;
        uint256 payout = ethAmount - fee;

        require(address(this).balance >= payout, "Insufficient ETH in treasury");

        publicProtocolReserve -= ethAmount;
        collectedProtocolFees += fee;
        totalSpiritBurned += amount;

        spirit.burnFrom(msg.sender, amount);
        (bool success, ) = msg.sender.call{value: payout}("");
        require(success, "ETH transfer failed");
        emit Redeemed(msg.sender, amount, payout);
    }

    /// @notice Allows anyone to deposit ETH into the public reserve
    function depositToPublicReserve() external payable {
        require(msg.value > 0, "Send ETH to deposit");
        publicProtocolReserve += msg.value;
        emit PublicReserveDeposit(msg.sender, msg.value);
    }

    /// @notice Allows the owner to collect protocol fees accrued from redemptions
    function collectProtocolFees() external onlyOwner {
        require(collectedProtocolFees > 0, "No fees to withdraw");

        uint256 amount = collectedProtocolFees;
        collectedProtocolFees = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");
        emit ProtocolFeesCollected(msg.sender, amount);
    }    
}

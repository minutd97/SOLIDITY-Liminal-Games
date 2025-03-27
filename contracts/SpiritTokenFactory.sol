// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SpiritToken} from "./SpiritToken.sol";

contract SpiritTokenFactory is Ownable {
    SpiritToken public immutable spirit;
    uint256 public pegRate; // in wei per SPIRIT (e.g. 0.00004 ETH = 40000000000000 wei)
    uint256 public burnFee; // in basis points (e.g. 100 = 1%)

    uint256 public publicEthReserve;
    uint256 public collectedEthFees;

    uint256 public totalSpiritMinted;
    uint256 public totalSpiritBurned;

    event PegRateUpdated(uint256 newRate);
    event BurnFeeUpdated(uint256 newFee);
    event Minted(address indexed user, uint256 ethIn, uint256 spiritOut);
    event Redeemed(address indexed user, uint256 spiritIn, uint256 ethOut);
    event TreasuryToppedUp(address indexed sender, uint256 amount);

    constructor(address _spiritToken, uint256 _pegRate, uint256 _burnFee) Ownable(msg.sender) {
        require(_spiritToken != address(0), "Invalid token address");
        spirit = SpiritToken(_spiritToken);
        pegRate = _pegRate;
        burnFee = _burnFee;
    }

    // Owner functions
    function setPegRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "Rate must be positive");
        pegRate = newRate;
        emit PegRateUpdated(newRate);
    }

    function setBurnFee(uint256 newFee) external onlyOwner {
        require(newFee <= 1000, "Max 10%");
        burnFee = newFee;
        emit BurnFeeUpdated(newFee);
    }

    // Public: ETH → SPIRIT
    function mintSpirit() external payable {
        require(msg.value > 0, "Send ETH to mint");
        uint256 amountToMint = msg.value * 1e18 / pegRate;
        publicEthReserve += msg.value;
        totalSpiritMinted += amountToMint;
        
        spirit.mint(msg.sender, amountToMint);
        emit Minted(msg.sender, msg.value, amountToMint);
    }

    // Public: SPIRIT → ETH
    function redeemSpirit(uint256 amount) external {
        require(amount > 0, "Nothing to redeem");
        uint256 ethAmount = amount * pegRate / 1e18;
        uint256 fee = (ethAmount * burnFee) / 10000;
        uint256 payout = ethAmount - fee;

        require(address(this).balance >= payout, "Insufficient ETH in treasury");

        publicEthReserve -= ethAmount;
        collectedEthFees += fee;
        totalSpiritBurned += amount;

        spirit.burnFrom(msg.sender, amount);
        (bool success, ) = msg.sender.call{value: payout}("");
        require(success, "ETH transfer failed");
        emit Redeemed(msg.sender, amount, payout);
    }

    function depositToPublicReserve() external payable {
        require(msg.value > 0, "Send ETH to deposit");
        publicEthReserve += msg.value;
        emit TreasuryToppedUp(msg.sender, msg.value);
    }

    // Withdraw collected fees, only owner
    function withdrawCollectedFees() external onlyOwner {
        require(collectedEthFees > 0, "No fees to withdraw");

        uint256 amount = collectedEthFees;
        collectedEthFees = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");
    }    
}

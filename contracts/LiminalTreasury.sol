// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract LiminalTreasury is Ownable {
    
    mapping(address => uint256) public profitPool;  // Track profit tokens
    mapping(address => uint256) public develompentPool;   // Track development tokens

    event TokenDeposit(address indexed token, address indexed sender, uint256 amount, uint8 poolType); // poolType => 0 = profit, 1 = development
    event TokenWithdrawal(address indexed token, address indexed to, uint256 amount, uint8 poolType); // poolType => 0 = profit, 1 = development
    event ETHDeposit(address indexed sender, uint256 amount, uint8 poolType); // poolType => 0 = profit, 1 = development
    event ETHWithdrawal(address indexed to, uint256 amount, uint8 poolType); // poolType => 0 = profit, 1 = development

    constructor() Ownable(msg.sender) { }

    // Function to deposit tokens or ETH to the profit pool
    function depositToProfitPool(address token, uint256 amount) external payable {
        if (token == address(0)) {
            // ETH deposit
            require(msg.value > 0, "Must send ETH to deposit");
            require(msg.value == amount, "ETH amount mismatch");
            profitPool[address(0)] += msg.value;
            emit ETHDeposit(msg.sender, msg.value, 0);
        } else {
            // Token deposit
            require(amount > 0, "Amount must be greater than 0");
            require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Token transfer failed");
            profitPool[token] += amount;
            emit TokenDeposit(token, msg.sender, amount, 0);
        }
    }

    // Function to deposit tokens or ETH to the profit pool
    function depositToDevelopmentPool(address token, uint256 amount) external payable {
        if (token == address(0)) {
            // ETH deposit
            require(msg.value > 0, "Must send ETH to deposit");
            require(msg.value == amount, "ETH amount mismatch");
            develompentPool[address(0)] += msg.value;
            emit ETHDeposit(msg.sender, msg.value, 1);
        } else {
            // Token deposit
            require(amount > 0, "Amount must be greater than 0");
            require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Token transfer failed");
            develompentPool[token] += amount;
            emit TokenDeposit(token, msg.sender, amount, 1);
        }
    }

    // Owner-only function to withdraw tokens or ETH from the profit pool
    function withdrawFromProfitPool(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            // ETH withdrawal
            require(profitPool[address(0)] >= amount, "Insufficient ETH in profit pool");
            profitPool[address(0)] -= amount;
            payable(msg.sender).transfer(amount);
            emit ETHWithdrawal(msg.sender, amount, 0);
        } else {
            // Token withdrawal
            require(profitPool[token] >= amount, "Insufficient tokens in profit pool");
            profitPool[token] -= amount;
            IERC20(token).transfer(msg.sender, amount);
            emit TokenWithdrawal(token, msg.sender, amount, 0);
        }
    }

    // Owner-only function to withdraw tokens or ETH from the profit pool
    function withdrawFromDevelopmentPool(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            // ETH withdrawal
            require(develompentPool[address(0)] >= amount, "Insufficient ETH in profit pool");
            develompentPool[address(0)] -= amount;
            payable(msg.sender).transfer(amount);
            emit ETHWithdrawal(msg.sender, amount, 1);
        } else {
            // Token withdrawal
            require(develompentPool[token] >= amount, "Insufficient tokens in profit pool");
            develompentPool[token] -= amount;
            IERC20(token).transfer(msg.sender, amount);
            emit TokenWithdrawal(token, msg.sender, amount, 1);
        }
    }

    // View function to check token balance in the profit pool
    function getProfitPoolBalance(address token) external view returns (uint256) {
        return profitPool[token];
    }

    // View function to check token balance in the bonus pool
    function getDevelopmentPoolBalance(address token) external view returns (uint256) {
        return develompentPool[token];
    }
}
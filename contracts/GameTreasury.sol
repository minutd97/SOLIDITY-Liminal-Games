// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Game Treasury
/// @notice Manages a controlled linear unlock of 75 million LIM tokens over a 6-month period, ensuring fairness and minimizing rug-pull risk. This treasury will be used for rewards, gifts, offers, publicity campaigns, and other promotional initiatives related to gameplay and community engagement.
contract GameTreasury is Ownable, AccessControl {
    using SafeERC20 for IERC20;
    bytes32 public constant POOL_LOADER_ROLE = keccak256("POOL_LOADER_ROLE");
    bytes32 public constant GAME_CONTRACT_ROLE = keccak256("GAME_CONTRACT_ROLE");

    IERC20 public immutable limToken;

    uint256 public immutable totalAllocation;
    uint256 public immutable upfrontUnlocked;
    uint256 public immutable startTimestamp; // Vesting start
    uint256 public immutable vestingDuration; // 6 months = 180 days

    uint256 public released;

    uint256 public gameFeeFunds; // Additional unlocked tokens not part of the 75M totalAllocation

    mapping(address => uint256) public liquidityPoolFees;
    mapping(address => uint256) public gameTreasuryFees;

    event TokensTransferred(address indexed to, uint256 amount);
    event FeeAdded(address indexed token, uint256 amount, string pool);
    event FeeCollected(address indexed token, uint256 amount, string pool, address to);

    constructor(address _limToken, uint256 _totalAllocation, uint256 _upfrontUnlocked) Ownable(msg.sender) {
        require(_limToken != address(0), "Invalid token");
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        limToken = IERC20(_limToken);
        totalAllocation = _totalAllocation;
        upfrontUnlocked = _upfrontUnlocked;
        vestingDuration = 180 days;
        startTimestamp = block.timestamp;
    }

    /// @notice Deposits totalAllocation of LIM tokens
    function receiveRewardTokens(uint256 amount) external onlyRole(POOL_LOADER_ROLE) {
        limToken.transferFrom(msg.sender, address(this), amount);
    }

    /// @notice Adds fully unlocked game fee tokens
    function receiveGameFeeTokens(uint256 amount) external onlyRole(POOL_LOADER_ROLE) {
        limToken.transferFrom(msg.sender, address(this), amount);
        gameFeeFunds += amount;
    }

    /// @notice Transfer unlocked tokens to an address
    function transferTokens(address to, uint256 amount) external onlyOwner {
        require(amount <= releasable(), "Insufficient unlocked tokens");
        released += amount;
        limToken.safeTransfer(to, amount);
        emit TokensTransferred(to, amount);
    }

    /// @notice Transfer gameFeeFunds tokens (separate from totalAllocation)
    function transferGameFeeTokens(address to, uint256 amount) external onlyOwner {
        require(amount <= gameFeeFunds, "Insufficient game fee fund");
        gameFeeFunds -= amount;
        limToken.safeTransfer(to, amount);
        emit TokensTransferred(to, amount);
    }

    /// @notice Calculate how many tokens are vested and available for release
    function vestedAmount() public view returns (uint256) {
        if (block.timestamp < startTimestamp) return 0;
        uint256 elapsed = block.timestamp - startTimestamp;
        if (elapsed >= vestingDuration) return totalAllocation;
        return upfrontUnlocked + ((totalAllocation - upfrontUnlocked) * elapsed) / vestingDuration;
    }

    /// @notice Returns how many tokens can still be transferred
    function releasable() public view returns (uint256) {
        return vestedAmount() - released;
    }

    /// @notice Track token fees into liquidity pool
    function addLiquidityFee(address tokenAddress, uint256 amount) external onlyRole(GAME_CONTRACT_ROLE) {
        liquidityPoolFees[tokenAddress] += amount;
        emit FeeAdded(tokenAddress, amount, "liquidityPool");
    }

    /// @notice Track token fees into game treasury
    function addGameFee(address tokenAddress, uint256 amount) external onlyRole(GAME_CONTRACT_ROLE) {
        gameTreasuryFees[tokenAddress] += amount;
        emit FeeAdded(tokenAddress, amount, "gameTreasury");
    }

    /// @notice Collect accumulated game fees to an address.
    /// These fees will be converted to LIM tokens and added to the gameFeeFund for future use.
    function collectGameFees(address tokenAddress, address to) external onlyOwner {
        uint256 amount = gameTreasuryFees[tokenAddress];
        require(amount > 0, "No game fees");
        gameTreasuryFees[tokenAddress] = 0;
        IERC20(tokenAddress).safeTransfer(to, amount);
        emit FeeCollected(tokenAddress, amount, "gameTreasury", to);
    }

    /// @notice Collect accumulated liquidity fees to an address.
    /// These fees will be converted to ETH and LIM, then added to the protocol’s Uniswap V4 liquidity pool.
    function collectLiquidityFees(address tokenAddress, address to) external onlyOwner {
        uint256 amount = liquidityPoolFees[tokenAddress];
        require(amount > 0, "No liquidity fees");
        liquidityPoolFees[tokenAddress] = 0;
        IERC20(tokenAddress).safeTransfer(to, amount);
        emit FeeCollected(tokenAddress, amount, "liquidityPool", to);
    }

    /// @notice Manage loader role
    function grantLoaderRole(address account) external onlyOwner {
        grantRole(POOL_LOADER_ROLE, account);
    }

    function revokeLoaderRole(address account) external onlyOwner {
        revokeRole(POOL_LOADER_ROLE, account);
    }

    /// @notice Manage game contract role
    function grantGameContractRole(address account) external onlyOwner {
        grantRole(GAME_CONTRACT_ROLE, account);
    }

    function revokeGameContractRole(address account) external onlyOwner {
        revokeRole(GAME_CONTRACT_ROLE, account);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITeamVestingController {
    function fundERC20ToWallet(address beneficiary, address token, uint256 amount) external;
    function fundETHToWallet(address beneficiary) external payable;
}

/// @title Team Vesting Vault
/// @notice Stores and releases tokens to TeamVestingController wallets over time, with rate limits per token.
/// @dev Supports rate-limited release of ETH and ERC20 tokens to beneficiaries through the controller.
contract TeamVestingVault is Ownable {
    address public immutable teamVestingController;

    struct ReleaseRate {
        uint256 ratePerSecond;
        uint64 startTime;
        uint256 releasedSoFar;
    }

    mapping(address => uint256) public totalTokensFunded; // token => amount
    mapping(address => ReleaseRate) public tokenReleaseRates; // token => release rule
    ReleaseRate public ethReleaseRate;

    mapping(address => uint256) public upfrontUnlocked; // token => amount
    uint256 public upfrontUnlockedETH;

    event TokensReleased(address indexed beneficiary, address indexed token, uint256 amount);
    event ETHReleased(address indexed beneficiary, uint256 amount);

    constructor(address _teamVestingController) Ownable(msg.sender) {
        require(_teamVestingController != address(0), "Invalid controller");
        teamVestingController = _teamVestingController;
    }

    /// @notice Sets a one-time release rate for an ERC20 token in tokens per second.
    function setERC20ReleaseRate(address token, uint256 ratePerSecond, uint256 upfrontAmount) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(ratePerSecond > 0, "Rate must be positive");

        ReleaseRate storage rate = tokenReleaseRates[token];
        require(rate.startTime == 0, "Rate already set");

        tokenReleaseRates[token] = ReleaseRate({
            ratePerSecond: ratePerSecond,
            startTime: uint64(block.timestamp),
            releasedSoFar: 0
        });

        upfrontUnlocked[token] = upfrontAmount;
    }

    /// @notice Sets a one-time release rate for native ETH in wei per second.
    function setETHReleaseRate(uint256 ratePerSecond, uint256 upfrontAmount) external onlyOwner {
        require(ratePerSecond > 0, "Rate must be positive");
        require(ethReleaseRate.startTime == 0, "ETH rate already set");

        ethReleaseRate = ReleaseRate({
            ratePerSecond: ratePerSecond,
            startTime: uint64(block.timestamp),
            releasedSoFar: 0
        });

        upfrontUnlockedETH = upfrontAmount;
    }

    /// @notice Sends a specified amount of ERC20 tokens to the vesting controller for a given beneficiary, respecting release rate.
    function releaseTokensTo(address beneficiary, address token, uint256 amount) external onlyOwner {
        uint256 releasable = releasableTokenAmount(token);
        require(amount <= releasable, "Amount exceeds releasable");

        ReleaseRate storage rate = tokenReleaseRates[token];
        rate.releasedSoFar += amount;
        totalTokensFunded[token] += amount;

        IERC20(token).approve(teamVestingController, amount);
        ITeamVestingController(teamVestingController).fundERC20ToWallet(beneficiary, token, amount);

        emit TokensReleased(beneficiary, token, amount);
    }

    /// @notice Sends a specified amount of ETH to the vesting controller for a given beneficiary, respecting release rate.
    function releaseETHTo(address beneficiary, uint256 amount) external onlyOwner {
        uint256 releasable = releasableETHAmount();
        require(amount <= releasable, "Amount exceeds releasable");

        ethReleaseRate.releasedSoFar += amount;

        ITeamVestingController(teamVestingController).fundETHToWallet{ value: amount }(beneficiary);
        emit ETHReleased(beneficiary, amount);
    }

    /// @notice Returns the current amount of ERC20 tokens available to be released based on the release rate and elapsed time.
    function releasableTokenAmount(address token) public view returns (uint256) {
        ReleaseRate memory rate = tokenReleaseRates[token];
        if (rate.startTime == 0) return 0;

        uint256 elapsed = block.timestamp - rate.startTime;
        uint256 maxAllowed = (elapsed * rate.ratePerSecond) + upfrontUnlocked[token];

        if (maxAllowed <= rate.releasedSoFar) return 0;

        uint256 available = maxAllowed - rate.releasedSoFar;
        uint256 balance = IERC20(token).balanceOf(address(this));
        return available > balance ? balance : available;
    }

    /// @notice Returns the current amount of ETH available to be released based on the release rate and elapsed time.
    function releasableETHAmount() public view returns (uint256) {
        ReleaseRate memory rate = ethReleaseRate;
        if (rate.startTime == 0) return 0;

        uint256 elapsed = block.timestamp - rate.startTime;
        uint256 maxAllowed = (elapsed * rate.ratePerSecond) + upfrontUnlockedETH;

        if (maxAllowed <= rate.releasedSoFar) return 0;

        uint256 available = maxAllowed - rate.releasedSoFar;
        uint256 balance = address(this).balance;
        return available > balance ? balance : available;
    }

    /// @notice Returns the current balance of a specific ERC20 token held by the vault.
    function remainingTokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /// @notice Returns the current ETH balance held by the vault.
    function remainingETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Accepts direct ETH transfers into the vault.
    receive() external payable {}
}

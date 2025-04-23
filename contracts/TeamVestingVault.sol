// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITeamVestingController {
    function fundERC20ToWallet(address beneficiary, address token, uint256 amount) external;
    function fundETHToWallet(address beneficiary) external payable;
}

contract TeamVestingVault is Ownable {
    address public immutable teamVestingManager;

    struct ReleaseRate {
        uint256 ratePerSecond;
        uint64 startTime;
        uint256 releasedSoFar;
    }

    mapping(address => uint256) public totalTokensFunded; // token => amount
    mapping(address => ReleaseRate) public tokenReleaseRates; // token => release rule
    ReleaseRate public ethReleaseRate;

    event TokensReleased(address indexed beneficiary, address indexed token, uint256 amount);
    event ETHReleased(address indexed beneficiary, uint256 amount);

    constructor(address _teamVestingManager) Ownable(msg.sender) {
        require(_teamVestingManager != address(0), "Invalid manager");
        teamVestingManager = _teamVestingManager;
    }

    /// @notice Sets the release rate for an ERC20 token, cannot overwrite once set
    function setTokenReleaseRate(address token, uint256 ratePerSecond) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(ratePerSecond > 0, "Rate must be positive");

        ReleaseRate storage rate = tokenReleaseRates[token];
        require(rate.startTime == 0, "Rate already set"); // cannot overwrite once set

        tokenReleaseRates[token] = ReleaseRate({
            ratePerSecond: ratePerSecond,
            startTime: uint64(block.timestamp),
            releasedSoFar: 0
        });
    }

    /// @notice Sets the release rate for native ETH, cannot overwrite once set
    function setETHReleaseRate(uint256 ratePerSecond) external onlyOwner {
        require(ratePerSecond > 0, "Rate must be positive");
        require(ethReleaseRate.startTime == 0, "ETH rate already set"); // cannot overwrite once set

        ethReleaseRate = ReleaseRate({
            ratePerSecond: ratePerSecond,
            startTime: uint64(block.timestamp),
            releasedSoFar: 0
        });
    }

    /// @notice Sends ERC20 tokens to the vesting controller for a beneficiary
    function releaseTokensTo(address beneficiary, address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token");

        ReleaseRate storage rate = tokenReleaseRates[token];
        require(rate.startTime > 0, "Token rate not set");

        uint256 elapsed = block.timestamp - rate.startTime;
        uint256 maxAllowed = elapsed * rate.ratePerSecond;
        require(rate.releasedSoFar + amount <= maxAllowed, "Exceeds token release rate");

        uint256 balance = IERC20(token).balanceOf(address(this));
        require(amount <= balance, "Insufficient token balance");

        rate.releasedSoFar += amount;
        totalTokensFunded[token] += amount;

        IERC20(token).approve(teamVestingManager, amount);
        ITeamVestingController(teamVestingManager).fundERC20ToWallet(beneficiary, token, amount);

        emit TokensReleased(beneficiary, token, amount);
    }

    /// @notice Sends ETH to the vesting controller for a beneficiary
    function releaseETHTo(address beneficiary, uint256 amount) external onlyOwner {
        require(ethReleaseRate.startTime > 0, "ETH rate not set");

        uint256 elapsed = block.timestamp - ethReleaseRate.startTime;
        uint256 maxAllowed = elapsed * ethReleaseRate.ratePerSecond;
        require(ethReleaseRate.releasedSoFar + amount <= maxAllowed, "Exceeds ETH release rate");

        require(amount <= address(this).balance, "Insufficient ETH");

        ethReleaseRate.releasedSoFar += amount;

        ITeamVestingController(teamVestingManager).fundETHToWallet{ value: amount }(beneficiary);
        emit ETHReleased(beneficiary, amount);
    }

    /// View functions
    function remainingTokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function remainingETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function releasableTokenAmount(address token) external view returns (uint256) {
        ReleaseRate memory rate = tokenReleaseRates[token];
        if (rate.startTime == 0) return 0;

        uint256 elapsed = block.timestamp - rate.startTime;
        uint256 maxAllowed = elapsed * rate.ratePerSecond;

        if (maxAllowed <= rate.releasedSoFar) return 0;

        uint256 available = maxAllowed - rate.releasedSoFar;
        uint256 balance = IERC20(token).balanceOf(address(this));
        return available > balance ? balance : available;
    }

    function releasableETHAmount() external view returns (uint256) {
        ReleaseRate memory rate = ethReleaseRate;
        if (rate.startTime == 0) return 0;

        uint256 elapsed = block.timestamp - rate.startTime;
        uint256 maxAllowed = elapsed * rate.ratePerSecond;

        if (maxAllowed <= rate.releasedSoFar) return 0;

        uint256 available = maxAllowed - rate.releasedSoFar;
        uint256 balance = address(this).balance;
        return available > balance ? balance : available;
    }

    receive() external payable {}
}

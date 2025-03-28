// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract LPRewardDistributor is Ownable, ReentrancyGuard {
    IERC20 public immutable limToken;      // Reward token (LIM)
    IERC20 public immutable lpToken;       // Uniswap V3 LP token (e.g. NFT or ERC20-style wrapper)

    uint256 public constant WEEK = 7 days;
    uint256 public weeklyEmissionCap;
    uint256 public rewardRate;             // per second

    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    uint256 public totalStaked;

    mapping(address => uint256) public balances;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 reward);
    event WeeklyEmissionCapUpdated(uint256 newCap);
    event RewardPoolLoaded(uint256 amount);

    constructor(address _lim, address _lp, uint256 _weeklyEmissionCap) Ownable(msg.sender) {
        require(_lim != address(0) && _lp != address(0), "Zero address");
        require(_weeklyEmissionCap > 0, "Invalid emission cap");
        limToken = IERC20(_lim);
        lpToken = IERC20(_lp);
        weeklyEmissionCap = _weeklyEmissionCap;
        rewardRate = _weeklyEmissionCap / WEEK;
        emit WeeklyEmissionCapUpdated(_weeklyEmissionCap);
    }

    function setWeeklyEmissionCap(uint256 cap) external onlyOwner {
        require(cap > 0, "Cap must be positive");
        weeklyEmissionCap = cap;
        rewardRate = cap / WEEK;
        emit WeeklyEmissionCapUpdated(cap);
    }

    function loadRewardPool(uint256 amount) external onlyOwner {
        require(amount > 0, "Zero amount");
        require(limToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        emit RewardPoolLoaded(amount);
    }

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero stake");
        updateReward(msg.sender);

        balances[msg.sender] += amount;
        totalStaked += amount;

        require(lpToken.transferFrom(msg.sender, address(this), amount), "LP transfer failed");
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0 && balances[msg.sender] >= amount, "Invalid unstake");
        updateReward(msg.sender);

        balances[msg.sender] -= amount;
        totalStaked -= amount;

        require(lpToken.transfer(msg.sender, amount), "LP transfer back failed");
        emit Unstaked(msg.sender, amount);
    }

    function claim() external nonReentrant {
        updateReward(msg.sender);
        uint256 reward = rewards[msg.sender];
        require(reward > 0, "No reward");
        rewards[msg.sender] = 0;
        require(limToken.transfer(msg.sender, reward), "Claim failed");
        emit Claimed(msg.sender, reward);
    }

    function updateReward(address user) internal {
        rewardPerTokenStored = currentRewardPerToken();
        lastUpdateTime = block.timestamp;

        if (user != address(0)) {
            rewards[user] = earned(user);
            userRewardPerTokenPaid[user] = rewardPerTokenStored;
        }
    }

    function currentRewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        uint256 timeElapsed = block.timestamp - lastUpdateTime;
        return rewardPerTokenStored + ((timeElapsed * rewardRate * 1e18) / totalStaked);
    }

    function earned(address user) public view returns (uint256) {
        uint256 delta = currentRewardPerToken() - userRewardPerTokenPaid[user];
        return ((balances[user] * delta) / 1e18) + rewards[user];
    }

    function getPendingRewards(address user) external view returns (uint256) {
        return earned(user);
    }

    function getLPStaked(address user) external view returns (uint256) {
        return balances[user];
    }

    function getTotalStaked() external view returns (uint256) {
        return totalStaked;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract LiminalStakingPool is Ownable, AccessControl, ReentrancyGuard {
    bytes32 public constant POOL_LOADER_ROLE = keccak256("POOL_LOADER_ROLE");
    IERC20 public immutable limToken;

    uint256 public constant APY = 15; // 15% per year
    uint256 public constant SECONDS_IN_YEAR = 365 days;

    struct StakeInfo {
        uint256 amount;
        uint256 rewardDebt;
        uint256 lastUpdate;
    }

    mapping(address => StakeInfo) public stakes;
    uint256 public totalStaked;

    uint256 public rewardPool; // Preloaded with 40M LIM at deployment

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 reward);
    event RewardLoaded(uint256 amount);

    constructor(address _lim) Ownable(msg.sender) {
        require(_lim != address(0), "Invalid LIM address");
        limToken = IERC20(_lim);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function loadRewardPool(uint256 amount) external onlyRole(POOL_LOADER_ROLE) {
        require(amount > 0, "Zero amount");
        require(limToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        rewardPool += amount;
        emit RewardLoaded(amount);
    }

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Invalid amount");
        updateReward(msg.sender);

        require(limToken.transferFrom(msg.sender, address(this), amount), "Stake transfer failed");

        stakes[msg.sender].amount += amount;
        stakes[msg.sender].lastUpdate = block.timestamp;
        totalStaked += amount;

        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0 && stakes[msg.sender].amount >= amount, "Invalid unstake amount");
        updateReward(msg.sender);

        stakes[msg.sender].amount -= amount;
        totalStaked -= amount;

        require(limToken.transfer(msg.sender, amount), "Unstake transfer failed");
        emit Unstaked(msg.sender, amount);
    }

    function claim() external nonReentrant {
        updateReward(msg.sender);
        uint256 reward = stakes[msg.sender].rewardDebt;
        require(reward > 0, "No reward");
        require(reward <= rewardPool, "Insufficient reward pool");

        stakes[msg.sender].rewardDebt = 0;
        rewardPool -= reward;

        require(limToken.transfer(msg.sender, reward), "Reward transfer failed");
        emit Claimed(msg.sender, reward);
    }

    function updateReward(address user) internal {
        StakeInfo storage stakeData = stakes[user];
        if (stakeData.amount == 0) return;

        uint256 timeElapsed = block.timestamp - stakeData.lastUpdate;
        uint256 pending = (stakeData.amount * APY * timeElapsed) / (100 * SECONDS_IN_YEAR);
        stakeData.rewardDebt += pending;
        stakeData.lastUpdate = block.timestamp;
    }

    function getPendingRewards(address user) external view returns (uint256) {
        StakeInfo memory stakeData = stakes[user];

        uint256 pending = 0;
        if (stakeData.amount > 0) {
            uint256 timeElapsed = block.timestamp - stakeData.lastUpdate;
            pending = (stakeData.amount * APY * timeElapsed) / (100 * SECONDS_IN_YEAR);
        }

        return stakeData.rewardDebt + pending;
    }

    function grantLoaderRole(address account) public onlyOwner {
        grantRole(POOL_LOADER_ROLE, account);
    }

    function revokeLoaderRole(address account) public onlyOwner {
        revokeRole(POOL_LOADER_ROLE, account);
    }

    // function drainRewardPool() external onlyOwner {
    //     rewardPool = 0;
    // }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface ILiminalStakingPool {
    function loadRewardPool(uint256 amount) external;
}

contract LiminalEmissionController is Ownable {
    IERC20 public immutable limToken;
    address public immutable stakingPool;

    uint256 public constant MONTHLY_EMISSION = 5_000_000 * 1e18;
    uint256 public constant TOTAL_EMISSION_CAP = 160_000_000 * 1e18;

    uint256 public lastEmissionTime;
    uint256 public totalEmitted;

    event EmissionReleased(uint256 amount, uint256 timestamp);
    event ManualEmissionLoaded(uint256 amount, uint256 timestamp);

    constructor(address _lim, address _stakingPool) Ownable(msg.sender) {
        require(_lim != address(0) && _stakingPool != address(0), "Zero address");
        limToken = IERC20(_lim);
        stakingPool = _stakingPool;
    }

    function emitMonthlyReward() external onlyOwner {
        require(block.timestamp >= lastEmissionTime + 30 days, "Emission not ready");
        require(totalEmitted + MONTHLY_EMISSION <= TOTAL_EMISSION_CAP, "Emission cap exceeded");

        lastEmissionTime = block.timestamp;
        totalEmitted += MONTHLY_EMISSION;

        limToken.approve(stakingPool, MONTHLY_EMISSION);
        ILiminalStakingPool(stakingPool).loadRewardPool(MONTHLY_EMISSION);

        emit EmissionReleased(MONTHLY_EMISSION, block.timestamp);
    }

    function getNextEmissionTime() external view returns (uint256) {
        return lastEmissionTime + 30 days;
    }

    function getRemainingEmission() external view returns (uint256) {
        return TOTAL_EMISSION_CAP - totalEmitted;
    }

    function getLIMBalance() external view returns (uint256) {
        return limToken.balanceOf(address(this));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IPositionManager {
    function getPositionLiquidity(uint256 tokenId) external view returns (uint128);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

contract LPStakingRewards is IERC721Receiver {
    IERC20 public immutable rewardToken;
    IPositionManager public immutable positionManager;

    uint256 public constant WEEK = 7 days;
    uint256 public constant DECAY_PERIOD = 4 weeks;
    uint256 public constant EARLY_REWARD_BPS = 1000; // 10%

    struct StakeInfo {
        address staker;
        uint128 liquidity;
        uint256 stakeTime;
        uint256 lastClaimedAt;
    }

    mapping(uint256 => StakeInfo) public stakes;
    uint256 public weeklyRewardAmount;
    uint256 public totalStakedLiquidity;
    uint256 public burnableRewards;
    uint256 public rewardFund;

    constructor(address _rewardToken, address _positionManager) {
        rewardToken = IERC20(_rewardToken);
        positionManager = IPositionManager(_positionManager);
    }

    function receiveRewardTokens(address from, uint256 amount) external {
        require(from == address(rewardToken), "Invalid reward token source");
        rewardToken.transferFrom(msg.sender, address(this), amount);
        rewardFund += amount;
    }

    function stake(uint256 tokenId) external {
        require(stakes[tokenId].staker == address(0), "Already staked");

        positionManager.safeTransferFrom(msg.sender, address(this), tokenId);
        uint128 liquidity = positionManager.getPositionLiquidity(tokenId);
        require(liquidity > 0, "Zero liquidity");

        stakes[tokenId] = StakeInfo({
            staker: msg.sender,
            liquidity: liquidity,
            stakeTime: block.timestamp,
            lastClaimedAt: block.timestamp
        });

        totalStakedLiquidity += liquidity;
    }

    function unstake(uint256 tokenId) external {
        StakeInfo storage stakeInfo = stakes[tokenId];
        require(stakeInfo.staker == msg.sender, "Not staker");

        (uint256 claimable, uint256 burnable) = getClaimableRewards(tokenId);
        if (claimable > 0) {
            rewardToken.transfer(msg.sender, claimable);
            rewardFund -= claimable;
        }
        if (burnable > 0) {
            burnableRewards += burnable;
        }

        totalStakedLiquidity -= stakeInfo.liquidity;
        delete stakes[tokenId];

        positionManager.safeTransferFrom(address(this), msg.sender, tokenId);
    }

    function claim(uint256 tokenId) external {
        StakeInfo storage stakeInfo = stakes[tokenId];
        require(stakeInfo.staker == msg.sender, "Not staker");

        (uint256 claimable, uint256 burnable) = getClaimableRewards(tokenId);
        require(claimable > 0 || burnable > 0, "Nothing to claim");

        stakeInfo.lastClaimedAt += ((block.timestamp - stakeInfo.lastClaimedAt) / WEEK) * WEEK;
        burnableRewards += burnable;

        if (claimable > 0) {
            rewardToken.transfer(msg.sender, claimable);
            rewardFund -= claimable;
        }
    }

    function getClaimableRewards(uint256 tokenId) public view returns (uint256 claimable, uint256 burnable) {
        StakeInfo memory stakeInfo = stakes[tokenId];
        require(stakeInfo.staker != address(0), "Not staked");

        uint256 weeksElapsed = (block.timestamp - stakeInfo.lastClaimedAt) / WEEK;
        if (weeksElapsed == 0 || totalStakedLiquidity == 0) return (0, 0);

        uint128 liq = stakeInfo.liquidity;
        uint256 effectiveWeeklyReward = rewardFund < weeklyRewardAmount ? rewardFund : weeklyRewardAmount;
        uint256 rewardPerWeek = (liq * effectiveWeeklyReward) / totalStakedLiquidity;

        for (uint256 i = 0; i < weeksElapsed; i++) {
            uint256 globalWeekIndex = (stakeInfo.lastClaimedAt - stakeInfo.stakeTime) / WEEK + i;
            if (globalWeekIndex < DECAY_PERIOD / WEEK) {
                uint256 earlyReward = (rewardPerWeek * EARLY_REWARD_BPS) / 10000;
                claimable += earlyReward;
                burnable += rewardPerWeek - earlyReward;
            } else {
                claimable += rewardPerWeek;
            }
        }
    }

    function burnAccumulated() external {
        uint256 toBurn = burnableRewards;
        require(toBurn > 0, "Nothing to burn");

        burnableRewards = 0;
        rewardFund -= toBurn;
        rewardToken.transfer(address(0), toBurn);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
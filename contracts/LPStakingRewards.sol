// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

interface ILiminalToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function burn(uint256 amount) external;
}

interface IPositionManager {
    function getPositionLiquidity(uint256 tokenId) external view returns (uint128);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

/// @title LP Staking Rewards - Stake Uniswap V4 LP NFTs to earn LIM with decay-based rewards
contract LPStakingRewards is Ownable, IERC721Receiver, AccessControl, ReentrancyGuard {
    bytes32 public constant POOL_LOADER_ROLE = keccak256("POOL_LOADER_ROLE");
    
    ILiminalToken public immutable limToken; // Reward token distributed over time
    IPositionManager public immutable positionManager; // Uniswap V4 PositionManager (ERC721)

    uint256 public constant WEEK = 7 days; // Time interval used for rewards
    uint256 public constant DECAY_PERIOD = 4 weeks; // Time before full rewards apply
    uint256 public constant EARLY_REWARD_BPS = 1000; // 10% claimable if within decay period

    struct StakeInfo {
        address staker; // Who owns the staked NFT
        uint128 liquidity; // Liquidity of the NFT at time of staking
        uint256 stakeTime; // Timestamp when staking began
        uint256 lastClaimedAt; // Last time rewards were claimed
    }

    mapping(uint256 => StakeInfo) public stakes; // tokenId => staking info
    uint256 public weeklyRewardAmount = 437_500 * 1e18; // Max weekly reward pool
    uint256 public totalStakedLiquidity; // Sum of all active NFT liquidities
    uint256 public burnableRewards; // Rewards decayed (non-claimable) but not yet burned
    uint256 public rewardFund; // Total tokens available for reward distribution
 
    /// @notice Initializes the staking contract with the reward token and position manager
    constructor(address _limToken, address _positionManager) Ownable(msg.sender) {
        require(_limToken != address(0), "Invalid token");
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        limToken = ILiminalToken(_limToken);
        positionManager = IPositionManager(_positionManager);
    }

    /// @notice Deposits LIM tokens into the reward fund
    function receiveRewardTokens(uint256 amount) external onlyRole(POOL_LOADER_ROLE) {
        limToken.transferFrom(msg.sender, address(this), amount);
        rewardFund += amount;
    }

    /// @notice Stake a Uniswap V4 LP position NFT into the contract
    function stake(uint256 tokenId) external nonReentrant {
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

    /// @notice Unstake a previously staked NFT and automatically claim any pending rewards
    function unstake(uint256 tokenId) external nonReentrant {
        StakeInfo storage stakeInfo = stakes[tokenId];
        require(stakeInfo.staker == msg.sender, "Not staker");

        (uint256 claimable, uint256 burnable) = getClaimableRewards(tokenId);
        if (claimable > 0) {
            limToken.transfer(msg.sender, claimable);
            rewardFund -= claimable;
        }
        if (burnable > 0) {
            burnableRewards += burnable;
        }

        totalStakedLiquidity -= stakeInfo.liquidity;
        delete stakes[tokenId];

        positionManager.safeTransferFrom(address(this), msg.sender, tokenId);
    }

    /// @notice Claim rewards for a staked NFT if at least one full week has passed
    function claim(uint256 tokenId) external nonReentrant {
        StakeInfo storage stakeInfo = stakes[tokenId];
        require(stakeInfo.staker == msg.sender, "Not staker");

        // Ensure at least one full week has passed
        require(block.timestamp >= stakeInfo.lastClaimedAt + WEEK, "Must wait 1 full week");

        (uint256 claimable, uint256 burnable) = getClaimableRewards(tokenId);
        require(claimable > 0 || burnable > 0, "Nothing to claim");

        stakeInfo.lastClaimedAt += ((block.timestamp - stakeInfo.lastClaimedAt) / WEEK) * WEEK;
        burnableRewards += burnable;

        if (claimable > 0) {
            limToken.transfer(msg.sender, claimable);
            rewardFund -= claimable;
        }
    }

    /// @notice View how much claimable and burnable reward a staked NFT has accrued
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

    /// @notice Burns all accumulated burnable rewards permanently
    function burnAccumulated() external nonReentrant {
        uint256 toBurn = burnableRewards;
        require(toBurn > 0, "Nothing to burn");

        burnableRewards = 0;
        rewardFund -= toBurn;
        limToken.burn(toBurn);
    }

    /// @notice Manage loader role
    function grantLoaderRole(address account) external onlyOwner {
        grantRole(POOL_LOADER_ROLE, account);
    }

    function revokeLoaderRole(address account) external onlyOwner {
        revokeRole(POOL_LOADER_ROLE, account);
    }

    /// @notice Accepts ERC721 safe transfers (required by Uniswap V4 positions)
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
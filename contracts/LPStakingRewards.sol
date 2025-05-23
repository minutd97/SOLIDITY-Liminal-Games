// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface ILiminalToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function burn(uint256 amount) external;
}

interface IPositionManager {
    function getPositionLiquidity(uint256 tokenId) external view returns (uint128);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

/// @title LP Staking Rewards
/// @notice Stake Uniswap V4 LP NFTs to earn LIM rewards with weekly unlocks, decay period, and burn tracking.
contract LPStakingRewards is Ownable, IERC721Receiver, AccessControl, ReentrancyGuard {
    bytes32 public constant POOL_LOADER_ROLE = keccak256("POOL_LOADER_ROLE"); // Role for reward token loaders

    ILiminalToken public immutable limToken; // LIM reward token contract
    IPositionManager public immutable positionManager; // LP NFT manager (Uniswap V4 Position Manager)

    uint256 public constant WEEK = 7 days; // Length of 1 full reward period
    uint256 public constant DECAY_PERIOD = 4 weeks; // Time before 100% of rewards are unlocked
    uint256 public constant BPS_DENOMINATOR = 10_000; // Basis point denominator
    uint256 public constant CLAIM_BPS = 1000; // 10% unlocked during decay

    uint256 public weeklyRewardCap = 437_500 * 1e18; // Max LIM rewards distributed per week

    struct StakeInfo {
        address staker; // Owner of the staked NFT
        uint128 liquidity; // Recorded liquidity of the position when staked
        uint256 stakeTime; // Timestamp of when stake started
        uint256 lastUpdatedAt; // Last time rewards were calculated
        uint256 rewardDebt; // Accumulator snapshot for reward calculation
        uint256 unclaimedClaimable; // Accumulated unlocked rewards
        uint256 unclaimedBurnable; // Accumulated burnable portion
    }

    mapping(uint256 => StakeInfo) public stakes; // tokenId → StakeInfo
    uint256 public accRewardPerLiquidity; // Global reward accumulator (scaled by 1e18)
    uint256 public totalStakedLiquidity; // Sum of all active staked liquidity
    uint256 public lastRewardTime; // Last timestamp global rewards were updated
    uint256 public rewardFund; // Remaining LIM rewards to distribute
    uint256 public burnableRewards; // Accumulated rewards marked for burning

    /// @notice Initializes the staking contract with LIM token and Uniswap V4 position manager
    constructor(address _limToken, address _positionManager) Ownable(msg.sender) {
        require(_limToken != address(0), "Invalid token");
        require(_positionManager != address(0), "Invalid position manager address");
        limToken = ILiminalToken(_limToken);
        positionManager = IPositionManager(_positionManager);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        lastRewardTime = block.timestamp;
    }

    /// @notice Transfers reward tokens into the contract
    function receiveRewardTokens(uint256 amount) external onlyRole(POOL_LOADER_ROLE) {
        limToken.transferFrom(msg.sender, address(this), amount);
        rewardFund += amount;
    }

    /// @notice Stake a Uniswap V4 LP NFT to start earning rewards
    function stake(uint256 tokenId) external nonReentrant {
        require(stakes[tokenId].staker == address(0), "Already staked");
        _updateGlobalRewards();

        positionManager.safeTransferFrom(msg.sender, address(this), tokenId);
        uint128 liquidity = positionManager.getPositionLiquidity(tokenId);
        require(liquidity > 0, "Zero liquidity");

        stakes[tokenId] = StakeInfo({
            staker: msg.sender,
            liquidity: liquidity,
            stakeTime: block.timestamp,
            lastUpdatedAt: block.timestamp,
            rewardDebt: accRewardPerLiquidity,
            unclaimedClaimable: 0,
            unclaimedBurnable: 0
        });

        totalStakedLiquidity += liquidity;
    }

    /// @notice Unstake your NFT and claim rewards; adds burnable to global tracker
    function unstake(uint256 tokenId) external nonReentrant {
        StakeInfo storage info = stakes[tokenId];
        require(info.staker == msg.sender, "Not staker");
        _claimAndUpdate(tokenId);
        totalStakedLiquidity -= info.liquidity;
        delete stakes[tokenId];
        positionManager.safeTransferFrom(address(this), msg.sender, tokenId);
    }

    /// @notice Claim your unlocked rewards; adds burnable to global tracker
    function claim(uint256 tokenId) external nonReentrant {
        StakeInfo storage info = stakes[tokenId];
        require(info.staker == msg.sender, "Not staker");
        _claimAndUpdate(tokenId);
    }

    /// @dev Claims rewards and updates internal tracking
    function _claimAndUpdate(uint256 tokenId) internal {
        StakeInfo storage info = stakes[tokenId];

        _updateGlobalRewards();
        _updateStakeReward(tokenId);

        uint256 claimAmount = info.unclaimedClaimable;
        uint256 burnAmount = info.unclaimedBurnable;

        if (claimAmount > 0) {
            rewardFund -= claimAmount;
            limToken.transfer(info.staker, claimAmount);
        }
        if (burnAmount > 0) {
            burnableRewards += burnAmount;
        }

        info.unclaimedClaimable = 0;
        info.unclaimedBurnable = 0;
        info.lastUpdatedAt = block.timestamp;
    }

    /// @dev Updates a staker’s rewards based on full-week tranches and decay logic
    function _updateStakeReward(uint256 tokenId) internal {
        StakeInfo storage info = stakes[tokenId];
        if (info.staker == address(0)) return;

        uint256 pendingTotal = uint256(info.liquidity) * (accRewardPerLiquidity - info.rewardDebt) / 1e18;
        if (pendingTotal == 0) {
            info.rewardDebt = accRewardPerLiquidity;
            return;
        }

        uint256 elapsed      = block.timestamp - info.lastUpdatedAt;
        uint256 fullWeeks    = elapsed / WEEK;
        if (fullWeeks == 0) {
            return;
        }
        uint256 fullWeekSecs = fullWeeks * WEEK;

        uint256 tranche = (pendingTotal * fullWeekSecs) / elapsed;

        uint256 trancheStart = info.lastUpdatedAt - info.stakeTime;
        uint256 trancheEnd   = trancheStart + fullWeekSecs;

        uint256 claimAmt;
        uint256 burnAmt;

        if (trancheEnd <= DECAY_PERIOD) {
            claimAmt = (tranche * CLAIM_BPS) / BPS_DENOMINATOR;
            burnAmt  = tranche - claimAmt;
        } else if (trancheStart >= DECAY_PERIOD) {
            claimAmt = tranche;
            burnAmt  = 0;
        } else {
            uint256 preDecaySecs  = DECAY_PERIOD - trancheStart;
            uint256 preTranche    = (tranche * preDecaySecs) / fullWeekSecs;
            uint256 postTranche   = tranche - preTranche;

            uint256 preClaim      = (preTranche * CLAIM_BPS) / BPS_DENOMINATOR;
            uint256 preBurn       = preTranche - preClaim;

            claimAmt = preClaim + postTranche;
            burnAmt  = preBurn;
        }

        info.unclaimedClaimable += claimAmt;
        info.unclaimedBurnable  += burnAmt;

        info.rewardDebt = accRewardPerLiquidity - ((pendingTotal - tranche) * 1e18) / info.liquidity;

        info.lastUpdatedAt += fullWeekSecs;
    }

    /// @dev Updates the global reward accumulator based on time elapsed
    function _updateGlobalRewards() internal {
        if (totalStakedLiquidity == 0) {
            lastRewardTime = block.timestamp;
            return;
        }

        uint256 elapsed = block.timestamp - lastRewardTime;
        if (elapsed == 0) return;

        uint256 cap = rewardFund < weeklyRewardCap ? rewardFund : weeklyRewardCap;
        uint256 rate = cap / WEEK;
        uint256 reward = elapsed * rate;

        accRewardPerLiquidity += (reward * 1e18) / totalStakedLiquidity;
        lastRewardTime = block.timestamp;
    }

    /// @notice Burns all accumulated burnable rewards
    function burnAccumulated() external onlyOwner {
        require(burnableRewards > 0, "Nothing to burn");
        uint256 toBurn = burnableRewards;
        burnableRewards = 0;
        limToken.burn(toBurn);
    }

    /// @notice Returns the currently claimable and burnable reward amounts
    function getPending(uint256 tokenId) public view returns (uint256 claimable, uint256 burnable) {
        StakeInfo memory info = stakes[tokenId];
        if (info.staker == address(0)) {
            return (0, 0);
        }

        uint256 acc = accRewardPerLiquidity;
        if (totalStakedLiquidity > 0 && block.timestamp > lastRewardTime) {
            uint256 elapsedGlobal = block.timestamp - lastRewardTime;
            uint256 cap = rewardFund < weeklyRewardCap ? rewardFund : weeklyRewardCap;
            uint256 rate = cap / WEEK;
            acc += (elapsedGlobal * rate * 1e18) / totalStakedLiquidity;
        }

        uint256 pendingTotal = uint256(info.liquidity) * (acc - info.rewardDebt) / 1e18;

        uint256 elapsed    = block.timestamp - info.lastUpdatedAt;
        uint256 fullWeeks  = elapsed / WEEK;
        if (fullWeeks == 0) {
            return (info.unclaimedClaimable, info.unclaimedBurnable);
        }
        uint256 fullWeekSecs = fullWeeks * WEEK;
        uint256 tranche      = (pendingTotal * fullWeekSecs) / elapsed;

        uint256 trancheStart = info.lastUpdatedAt - info.stakeTime;
        uint256 trancheEnd   = trancheStart + fullWeekSecs;

        uint256 claimAmt;
        uint256 burnAmt;

        if (trancheEnd <= DECAY_PERIOD) {
            claimAmt = (tranche * CLAIM_BPS) / BPS_DENOMINATOR;
            burnAmt  = tranche - claimAmt;
        } else if (trancheStart >= DECAY_PERIOD) {
            claimAmt = tranche;
            burnAmt  = 0;
        } else {
            uint256 preDecaySecs = DECAY_PERIOD - trancheStart;
            uint256 preTranche = (tranche * preDecaySecs) / fullWeekSecs;
            uint256 postTranche = tranche - preTranche;

            uint256 preClaim = (preTranche * CLAIM_BPS) / BPS_DENOMINATOR;
            uint256 preBurn = preTranche - preClaim;

            claimAmt = preClaim + postTranche;
            burnAmt  = preBurn;
        }

        claimable = info.unclaimedClaimable + claimAmt;
        burnable  = info.unclaimedBurnable  + burnAmt;
    }

    /// @notice View how much of the pending reward is still locked (not yet in a full week)
    function getLocked(uint256 tokenId) public view returns (uint256 locked) {
        StakeInfo memory info = stakes[tokenId];
        if (info.staker == address(0)) return 0;

        uint256 acc = accRewardPerLiquidity;
        if (totalStakedLiquidity > 0 && block.timestamp > lastRewardTime) {
            uint256 elapsedGlobal = block.timestamp - lastRewardTime;
            uint256 cap = rewardFund < weeklyRewardCap ? rewardFund : weeklyRewardCap;
            uint256 rate = cap / WEEK;
            acc += (elapsedGlobal * rate * 1e18) / totalStakedLiquidity;
        }

        uint256 rawPending = uint256(info.liquidity) * (acc - info.rewardDebt) / 1e18;
        if (rawPending == 0) return 0;

        uint256 elapsed     = block.timestamp - info.lastUpdatedAt;
        uint256 fullWeeks   = elapsed / WEEK;
        uint256 unlockedSec = fullWeeks * WEEK;

        uint256 unlockedTranche = (elapsed == 0) ? 0 : (rawPending * unlockedSec) / elapsed;

        locked = rawPending - unlockedTranche;
    }

    /// @notice Grants POOL_LOADER_ROLE to an account
    function grantLoaderRole(address account) external onlyOwner {
        grantRole(POOL_LOADER_ROLE, account);
    }

    /// @notice Revokes POOL_LOADER_ROLE from an account
    function revokeLoaderRole(address account) external onlyOwner {
        revokeRole(POOL_LOADER_ROLE, account);
    }
  
    /// @notice ERC721 hook to allow NFT reception
    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}

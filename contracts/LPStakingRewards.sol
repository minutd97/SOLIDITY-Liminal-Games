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
/// @notice Stake Uniswap V4 LP NFTs to earn LIM based on liquidity and time, with decay and burn logic.
contract LPStakingRewards is Ownable, IERC721Receiver, AccessControl, ReentrancyGuard {
    bytes32 public constant POOL_LOADER_ROLE = keccak256("POOL_LOADER_ROLE");

    ILiminalToken public immutable limToken;
    IPositionManager public immutable positionManager;

    uint256 public constant WEEK = 7 days;
    uint256 public constant DECAY_PERIOD = 4 weeks;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant CLAIM_BPS = 1000; // 10%

    uint256 public weeklyRewardCap = 437_500 * 1e18;

    struct StakeInfo {
        address staker;
        uint128 liquidity;
        uint256 stakeTime;
        uint256 lastUpdatedAt;
        uint256 rewardDebt;
        uint256 unclaimedClaimable;
        uint256 unclaimedBurnable;
    }

    mapping(uint256 => StakeInfo) public stakes;
    uint256 public accRewardPerLiquidity;
    uint256 public totalStakedLiquidity;
    uint256 public lastRewardTime;
    uint256 public rewardFund;
    uint256 public burnableRewards;

    constructor(address _limToken, address _positionManager) Ownable(msg.sender) {
        require(_limToken != address(0), "Invalid token");
        limToken = ILiminalToken(_limToken);
        positionManager = IPositionManager(_positionManager);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        lastRewardTime = block.timestamp;
    }

    function receiveRewardTokens(uint256 amount) external onlyRole(POOL_LOADER_ROLE) {
        limToken.transferFrom(msg.sender, address(this), amount);
        rewardFund += amount;
    }

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

    function unstake(uint256 tokenId) external nonReentrant {
        StakeInfo storage info = stakes[tokenId];
        require(info.staker == msg.sender, "Not staker");
        _updateGlobalRewards();
        _updateStakeReward(tokenId);

        uint256 claimAmount = info.unclaimedClaimable;
        uint256 burnAmount = info.unclaimedBurnable;

        if (claimAmount > 0) {
            rewardFund -= claimAmount;
            limToken.transfer(msg.sender, claimAmount);
        }
        if (burnAmount > 0) {
            burnableRewards += burnAmount;
        }

        totalStakedLiquidity -= info.liquidity;
        delete stakes[tokenId];
        positionManager.safeTransferFrom(address(this), msg.sender, tokenId);
    }

    function claim(uint256 tokenId) external nonReentrant {
        StakeInfo storage info = stakes[tokenId];
        require(info.staker == msg.sender, "Not staker");
        _updateGlobalRewards();
        _updateStakeReward(tokenId);

        uint256 claimAmount = info.unclaimedClaimable;
        uint256 burnAmount = info.unclaimedBurnable;
        require(claimAmount > 0 || burnAmount > 0, "Nothing to claim");

        if (claimAmount > 0) {
            rewardFund -= claimAmount;
            limToken.transfer(msg.sender, claimAmount);
        }
        if (burnAmount > 0) {
            burnableRewards += burnAmount;
        }

        info.unclaimedClaimable = 0;
        info.unclaimedBurnable = 0;
        info.lastUpdatedAt = block.timestamp;
    }

    /// @dev Update a single stake’s accumulated rewards, unlocking only full‐week tranches
    ///      and splitting each tranche 10% claimable / 90% burnable during the first 4 weeks.
    function _updateStakeReward(uint256 tokenId) internal {
        StakeInfo storage info = stakes[tokenId];
        if (info.staker == address(0)) return;

        // 1) Calculate total newly accrued rewards since last rewardDebt
        uint256 pendingTotal = uint256(info.liquidity)
            * (accRewardPerLiquidity - info.rewardDebt)
            / 1e18;
        if (pendingTotal == 0) {
            // Nothing to allocate; just bump debt
            info.rewardDebt = accRewardPerLiquidity;
            return;
        }

        // 2) Compute how many full weeks have elapsed since lastUpdatedAt
        uint256 elapsed      = block.timestamp - info.lastUpdatedAt;
        uint256 fullWeeks    = elapsed / WEEK;
        if (fullWeeks == 0) {
            // No full‐week tranche yet
            return;
        }
        uint256 fullWeekSecs = fullWeeks * WEEK;

        // 3) Pro‐rate the pendingTotal into exactly that tranche
        uint256 tranche = (pendingTotal * fullWeekSecs) / elapsed;

        // 4) Split the tranche across the 4-week decay boundary
        uint256 trancheStart = info.lastUpdatedAt - info.stakeTime;
        uint256 trancheEnd   = trancheStart + fullWeekSecs;

        uint256 claimAmt;
        uint256 burnAmt;

        if (trancheEnd <= DECAY_PERIOD) {
            // Entirely pre-decay: 10% claimable, 90% burnable
            claimAmt = (tranche * CLAIM_BPS) / BPS_DENOMINATOR;
            burnAmt  = tranche - claimAmt;
        } else if (trancheStart >= DECAY_PERIOD) {
            // Entirely post-decay: 100% claimable
            claimAmt = tranche;
            burnAmt  = 0;
        } else {
            // Straddles boundary: split by seconds
            uint256 preDecaySecs  = DECAY_PERIOD - trancheStart;
            uint256 preTranche    = (tranche * preDecaySecs) / fullWeekSecs;
            uint256 postTranche   = tranche - preTranche;

            uint256 preClaim      = (preTranche * CLAIM_BPS) / BPS_DENOMINATOR;
            uint256 preBurn       = preTranche - preClaim;

            claimAmt = preClaim + postTranche;
            burnAmt  = preBurn;
        }

        // 5) Accumulate into the stake
        info.unclaimedClaimable += claimAmt;
        info.unclaimedBurnable  += burnAmt;

        // 6) Bump rewardDebt so the remaining (pendingTotal - tranche) stays unallocated
        info.rewardDebt = accRewardPerLiquidity
            - ((pendingTotal - tranche) * 1e18) / info.liquidity;

        // 7) Advance our cursor
        info.lastUpdatedAt += fullWeekSecs;
    }

    /// @dev View how much is currently claimable vs. burnable (respecting full-week unlocks
    ///      and 4-week decay rules), without modifying state.
    function getPending(uint256 tokenId) public view returns (uint256 claimable, uint256 burnable) {
        StakeInfo memory info = stakes[tokenId];
        if (info.staker == address(0)) {
            return (0, 0);
        }

        // 1) Simulate up‐to‐date global accRewardPerLiquidity
        uint256 acc = accRewardPerLiquidity;
        if (totalStakedLiquidity > 0 && block.timestamp > lastRewardTime) {
            uint256 elapsedGlobal = block.timestamp - lastRewardTime;
            uint256 cap           = rewardFund < weeklyRewardCap ? rewardFund : weeklyRewardCap;
            uint256 rate          = cap / WEEK;
            acc += (elapsedGlobal * rate * 1e18) / totalStakedLiquidity;
        }

        // 2) Compute total raw pending
        uint256 pendingTotal = uint256(info.liquidity) * (acc - info.rewardDebt) / 1e18;

        // 3) Compute full‐week tranche since lastUpdatedAt
        uint256 elapsed    = block.timestamp - info.lastUpdatedAt;
        uint256 fullWeeks  = elapsed / WEEK;
        if (fullWeeks == 0) {
            return (info.unclaimedClaimable, info.unclaimedBurnable);
        }
        uint256 fullWeekSecs = fullWeeks * WEEK;
        uint256 tranche      = (pendingTotal * fullWeekSecs) / elapsed;

        // 4) Split across decay boundary (same logic as above)
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

        // 5) Add already‐unclaimed amounts
        claimable = info.unclaimedClaimable + claimAmt;
        burnable  = info.unclaimedBurnable  + burnAmt;
    }

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

    function burnAccumulated() external onlyOwner {
        require(burnableRewards > 0, "Nothing to burn");
        uint256 toBurn = burnableRewards;
        burnableRewards = 0;
        limToken.burn(toBurn);
    }

    function grantLoaderRole(address account) external onlyOwner {
        grantRole(POOL_LOADER_ROLE, account);
    }

    function revokeLoaderRole(address account) external onlyOwner {
        revokeRole(POOL_LOADER_ROLE, account);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}

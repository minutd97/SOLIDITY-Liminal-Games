// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IUniversalTransfer {
    function receiveRewardTokens(uint256 amount) external;
}

/// @title LiminalDistributor
/// @notice Manages one-time token allocations for Game Treasury, Liminal Staking, LP Staking, and Governance contracts.
contract LiminalDistributor is Ownable {
    /// @notice The LIM token used for all distributions
    IERC20 public immutable limToken;

    /// @notice Game Treasury contract address
    address public gameTreasury;

    /// @notice Liminal Staking Rewards contract address
    address public liminalStaking;

    /// @notice LP Staking Rewards contract address
    address public lpStaking;

    /// @notice Governance contract address
    address public limGovernor;

    /// @notice Tracks whether each contract has already received its allocation
    mapping(address => bool) public distributed;

    /// @notice Tokens allocated to the Game Treasury (75M)
    uint256 public constant GAME_TREASURY_AMOUNT = 75_000_000 * 1e18;

    /// @notice Tokens allocated to Liminal Staking Rewards (80M)
    uint256 public constant LIMINAL_STAKING_AMOUNT = 80_000_000 * 1e18;

    /// @notice Tokens allocated to LP Staking Rewards (45M)
    uint256 public constant LP_STAKING_AMOUNT = 45_000_000 * 1e18;

    /// @notice Tokens allocated to Governance contract (30M)
    uint256 public constant LIM_GOVERNOR_AMOUNT = 30_000_000 * 1e18;

    /// @notice Initializes the distributor with the LIM token address
    /// @param _limToken Address of the LIM ERC20 token
    constructor(address _limToken) Ownable(msg.sender) {
        require(_limToken != address(0), "Invalid LIM token address");
        limToken = IERC20(_limToken);
    }

    /// @notice Sets the Game Treasury contract address
    function setGameTreasury(address _addr) external onlyOwner {
        require(_addr != address(0), "Invalid game treasury address");
        gameTreasury = _addr;
    }

    /// @notice Sets the Liminal Staking Rewards contract address
    function setLiminalStaking(address _addr) external onlyOwner {
        require(_addr != address(0), "Invalid lim staking address");
        liminalStaking = _addr;
    }

    /// @notice Sets the LP Staking Rewards contract address
    function setLPStaking(address _addr) external onlyOwner {
        require(_addr != address(0), "Invalid lp staking address");
        lpStaking = _addr;
    }

    /// @notice Sets the Governance contract address
    function setLimGovernor(address _addr) external onlyOwner {
        require(_addr != address(0), "Invalid lim governor address");
        limGovernor = _addr;
    }

    /// @notice Distributes tokens to the Game Treasury (one-time)
    function distributeToGameTreasury() external onlyOwner {
        _distribute(gameTreasury, GAME_TREASURY_AMOUNT);
    }

    /// @notice Distributes tokens to the Liminal Staking contract (one-time)
    function distributeToLiminalStaking() external onlyOwner {
        _distribute(liminalStaking, LIMINAL_STAKING_AMOUNT);
    }

    /// @notice Distributes tokens to the LP Staking contract (one-time)
    function distributeToLPStaking() external onlyOwner {
        _distribute(lpStaking, LP_STAKING_AMOUNT);
    }

    /// @notice Distributes tokens to the Governor contract (one-time)
    function distributeToGovernor() external onlyOwner {
        _distribute(limGovernor, LIM_GOVERNOR_AMOUNT);
    }

    /// @notice Internal helper to approve and notify target contracts to pull tokens
    /// @param target The contract to receive tokens
    /// @param amount The amount of LIM tokens allocated
    function _distribute(address target, uint256 amount) internal {
        require(target != address(0), "Target not set");
        require(amount > 0, "Amount must be greater than 0");
        require(!distributed[target], "Already distributed");

        distributed[target] = true;

        // Approve the recipient contract to pull the tokens
        limToken.approve(target, amount);

        // Notify recipient to pull the tokens via transferFrom()
        IUniversalTransfer(target).receiveRewardTokens(amount);
    }
}

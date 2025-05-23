// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title LongTermReserve
/// @notice Manages a time-locked reserve of ERC20 tokens with cliff and linear vesting
contract LongTermReserve is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable LIM; // The ERC20 token being reserved and vested
    address public controller; // The controller address allowed to release unlocked tokens

    uint256 public immutable totalAllocation; // Total tokens allocated for vesting
    uint256 public immutable upfrontUnlocked; // Amount unlocked immediately after the cliff duration
    uint256 public immutable startTimestamp; // Vesting start time (block timestamp at deployment)
    uint256 public immutable cliffDuration; // Cliff duration in seconds (tokens are locked before this)
    uint256 public immutable vestingDuration; // Total vesting duration in seconds (includes cliff)

    uint256 public released; // Total amount of tokens released so far

    event ControllerUpdated(address indexed newController);
    event TokensReleased(uint256 amount, address to);

    /// @notice Deploys the LongTermReserve contract
    /// @param limToken The ERC20 token address to manage
    /// @param initialController The controller allowed to release tokens
    /// @param upfront Amount unlocked immediately after cliff
    /// @param total Total tokens reserved
    /// @param cliffTime Duration before any tokens can be released
    /// @param vestingTime Total vesting duration from start (includes cliff)
    constructor(
        address limToken,
        address initialController,
        uint256 upfront,
        uint256 total,
        uint256 cliffTime,
        uint256 vestingTime
    ) Ownable(msg.sender) {
        require(limToken != address(0), "Invalid LIM address");
        require(initialController != address(0), "Invalid controller address");
        LIM = IERC20(limToken);
        controller = initialController;

        upfrontUnlocked = upfront;
        totalAllocation = total;
        startTimestamp = block.timestamp;
        cliffDuration = cliffTime;
        vestingDuration = vestingTime;
    }

    /// @notice Ensures only the controller can call
    modifier onlyController() {
        require(msg.sender == controller, "Not authorized");
        _;
    }

    /// @notice Updates the controller address
    function setController(address newController) external onlyOwner {
        require(newController != address(0), "Invalid address");
        controller = newController;
        emit ControllerUpdated(newController);
    }

    /// @notice Releases a specified amount of unlocked tokens to the controller
    function release(uint256 amount) external onlyController {
        uint256 available = releasable();
        require(amount > 0 && amount <= available, "Invalid release amount");

        released += amount;
        LIM.safeTransfer(controller, amount);

        emit TokensReleased(amount, controller);
    }

    /// @notice Calculates how many tokens are currently available to release
    function releasable() public view returns (uint256) {
        uint256 currentTime = block.timestamp;

        if (currentTime < startTimestamp + cliffDuration) {
            return 0;
        }

        uint256 unlocked;
        uint256 endTime = startTimestamp + vestingDuration;

        if (currentTime >= endTime) {
            unlocked = totalAllocation;
        } else {
            // Time after cliff
            uint256 linearTime = currentTime - (startTimestamp + cliffDuration);
            uint256 linearDuration = vestingDuration - cliffDuration;

            uint256 linearUnlocked = ((totalAllocation - upfrontUnlocked) * linearTime) / linearDuration;
            unlocked = upfrontUnlocked + linearUnlocked;
        }

        return unlocked > released ? unlocked - released : 0;
    }
}
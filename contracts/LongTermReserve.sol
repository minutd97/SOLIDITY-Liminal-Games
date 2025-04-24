// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract LongTermReserve is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable LIM;
    address public controller;

    uint256 public immutable totalAllocation;
    uint256 public immutable upfrontUnlocked;
    uint256 public immutable startTimestamp;
    uint256 public immutable cliffDuration;
    uint256 public immutable vestingDuration;

    uint256 public released;

    event ControllerUpdated(address indexed newController);
    event TokensReleased(uint256 amount, address to);

    constructor(
        address limToken,
        address initialController,
        uint256 upfront,
        uint256 total,
        uint256 cliffTime,
        uint256 vestingTime
    ) Ownable(msg.sender) {
        LIM = IERC20(limToken);
        controller = initialController;

        upfrontUnlocked = upfront;
        totalAllocation = total;
        startTimestamp = block.timestamp;
        cliffDuration = cliffTime;
        vestingDuration = vestingTime;
    }

    modifier onlyController() {
        require(msg.sender == controller, "Not authorized");
        _;
    }

    function setController(address newController) external onlyOwner {
        require(newController != address(0), "Invalid address");
        controller = newController;
        emit ControllerUpdated(newController);
    }

    function release(uint256 amount) external onlyController {
        uint256 available = releasable();
        require(amount > 0 && amount <= available, "Invalid release amount");

        released += amount;
        LIM.safeTransfer(controller, amount);

        emit TokensReleased(amount, controller);
    }

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
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BlockTimeChecker {

    uint256 public constant TARGET_TIME = 180; // Roughly 3 minutes in seconds (180 seconds)
    uint256 public startTime;

    // Event to track when monitoring starts
    event MonitoringStarted(uint256 startTime);

    // Function to start tracking the current timestamp
    function startMonitoring() external {
        startTime = block.timestamp; // Track using the block's timestamp
        emit MonitoringStarted(startTime);
    }

    // View function to check how much time is left until the target time
    function timeLeft() external view returns (uint256) {
        if (startTime == 0) {
            return 0; // Monitoring hasn't started yet
        }
        uint256 timePassed = block.timestamp - startTime;

        if (timePassed >= TARGET_TIME) {
            return 0; // Target time reached
        } else {
            return TARGET_TIME - timePassed;
        }
    }

    // View function to check the current timestamp
    function getCurrentTimestamp() external view returns (uint256) {
        return block.timestamp;
    }
}
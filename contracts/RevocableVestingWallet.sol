// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/finance/VestingWallet.sol";

contract RevocableVestingWallet is VestingWallet {
    bool public revoked;
    uint64 public revokedAt;

    constructor(
        address beneficiary,
        uint64 startTimestamp,
        uint64 durationSeconds
    ) VestingWallet(beneficiary, startTimestamp, durationSeconds) {}

    function revoke() external onlyOwner {
        require(!revoked, "Already revoked");
        revoked = true;
        revokedAt = uint64(block.timestamp);
    }

    function _vestingSchedule(
        uint256 totalAllocation,
        uint64 timestamp
    ) internal view override returns (uint256) {
        if (revoked && timestamp > revokedAt) {
            timestamp = revokedAt;
        }
        return super._vestingSchedule(totalAllocation, timestamp);
    }
}

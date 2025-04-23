// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/finance/VestingWallet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TeamVestingWallet is VestingWallet, AccessControl {
    bytes32 public constant WALLET_CONTROLLER_ROLE = keccak256("WALLET_CONTROLLER_ROLE");

    bool public revoked;
    uint64 public revokedAt;
    address public immutable vault;

    constructor(
        address beneficiary,
        uint64 startTimestamp,
        uint64 durationSeconds,
        address vaultAddress
    ) VestingWallet(beneficiary, startTimestamp, durationSeconds) {
        vault = vaultAddress;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        grantRole(WALLET_CONTROLLER_ROLE, msg.sender);
    }

    function revoke() external onlyRole(WALLET_CONTROLLER_ROLE) {
        require(!revoked, "Already revoked");
        revoked = true;
        revokedAt = uint64(block.timestamp);
    }

    function fundVaultWithLeftoverERC20(address token) external onlyRole(WALLET_CONTROLLER_ROLE) {
        require(revoked, "Vesting not revoked");

        uint256 total = IERC20(token).balanceOf(address(this));
        uint256 vested = releasable(token);
        uint256 unvested = total > vested ? total - vested : 0;

        require(unvested > 0, "Nothing to fund");
        IERC20(token).transfer(vault, unvested);
    }

    function fundVaultWithLeftoverETH() external onlyRole(WALLET_CONTROLLER_ROLE) {
        require(revoked, "Vesting not revoked");

        uint256 total = address(this).balance;
        uint256 vested = releasable();
        uint256 unvested = total > vested ? total - vested : 0;

        require(unvested > 0, "Nothing to fund");
        (bool success, ) = vault.call{ value: unvested }("");
        require(success, "ETH transfer failed");
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

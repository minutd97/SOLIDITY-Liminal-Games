// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TeamVestingVault is Ownable {
    address public immutable teamVestingManager;
    IERC20 public immutable limToken;
    uint256 public immutable tokenUnlockTime;

    bool public tokenReleased;

    event TokensReleased(address to, uint256 amount);

    constructor(
        address _teamVestingManager,
        address _limToken,
        uint256 _tokenUnlockTime
    ) Ownable(msg.sender) {
        require(_teamVestingManager != address(0), "Invalid manager");
        require(_limToken != address(0), "Invalid token");
        require(_tokenUnlockTime >= block.timestamp, "Token unlock must be in future");

        teamVestingManager = _teamVestingManager;
        limToken = IERC20(_limToken);
        tokenUnlockTime = _tokenUnlockTime;
    }

    function releaseTokens() external onlyOwner {
        require(!tokenReleased, "Tokens already released");
        require(block.timestamp >= tokenUnlockTime, "Tokens not unlocked yet");

        tokenReleased = true;
        uint256 balance = limToken.balanceOf(address(this));
        require(balance > 0, "No tokens to release");

        bool success = limToken.transfer(teamVestingManager, balance);
        require(success, "Token transfer failed");

        emit TokensReleased(teamVestingManager, balance);
    }
}

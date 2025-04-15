// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITeamVestingController {
    function fundERC20ToWallet(address beneficiary, address token, uint256 amount) external;
}

contract TeamVestingVault is Ownable {
    address public immutable teamVestingManager;
    IERC20 public immutable limToken;
    uint256 public immutable tokenUnlockTime;

    uint256 public totalTokensFunded;
    bool public fullyReleased;

    event TokensReleased(address beneficiary, uint256 amount);
    event FullyReleased(uint256 totalAmount);

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

    function releaseTokensTo(address beneficiary, uint256 amount) external onlyOwner {
        require(block.timestamp >= tokenUnlockTime, "Tokens not unlocked yet");
        require(!fullyReleased, "Vault fully released");

        uint256 balance = limToken.balanceOf(address(this));
        require(amount <= balance, "Insufficient vault balance");

        totalTokensFunded += amount;

        if (amount == balance) {
            fullyReleased = true;
            emit FullyReleased(totalTokensFunded);
        }

        limToken.approve(teamVestingManager, amount);
        ITeamVestingController(teamVestingManager).fundERC20ToWallet(beneficiary, address(limToken), amount);
        emit TokensReleased(beneficiary, amount);
    }

    function remainingTokenBalance() external view returns (uint256) {
        return limToken.balanceOf(address(this));
    }
}

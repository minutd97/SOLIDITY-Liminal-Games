// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract KNYBet is Ownable, Pausable, AccessControl {

    bytes32 public constant MANAGE_ROLE = keccak256("MANAGE_ROLE");

    struct Bet {
        address bettor;
    }

    struct GameBetInfo {
        bool isActive;
        bool isSettled;
        //address winner;
        Bet[] bets;
    }

    mapping(uint => GameBetInfo) public gameBets;

    event GameRegistered(uint indexed gameId);
    event BetPlaced(uint indexed gameId, address indexed bettor, address indexed playerBetOn);
    event GameSettled(uint indexed gameId, address winner);

    // function getPlayerToGameKey(uint gameId, address player) internal pure returns (bytes32) {
    //     return keccak256(abi.encodePacked(gameId, player));
    // }

    constructor() Ownable(msg.sender) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender); // Owner has the admin role by default
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function registerGameInBetting(uint gameId) external onlyRole(MANAGE_ROLE) {
        require(!gameBets[gameId].isActive, "Game already registered");
        gameBets[gameId].isActive = true;

        emit GameRegistered(gameId);
    }

    function placeBet(uint gameId, address playerBetOn) external whenNotPaused {
        require(gameBets[gameId].isActive, "Game is not active for betting");
        require(!gameBets[gameId].isSettled, "Betting closed for this game");

        gameBets[gameId].bets.push(Bet(msg.sender));

        emit BetPlaced(gameId, msg.sender, playerBetOn);
    }

    function settleBets(uint gameId, address winner) external onlyRole(MANAGE_ROLE) {
        GameBetInfo storage game = gameBets[gameId];
        require(game.isActive, "Game was not registered for betting");
        require(!game.isSettled, "Game already settled");

        game.isSettled = true;
        //game.winner = winner;

        emit GameSettled(gameId, winner);
    }

    function grantManageRole(address _account) public onlyOwner {
        grantRole(MANAGE_ROLE, _account);
    }

    function revokeMmanageRole(address _account) public onlyOwner {
        revokeRole(MANAGE_ROLE, _account);
    }
}

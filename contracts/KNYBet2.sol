// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IKaijiNoYurei {
    function gameExists(uint gameId) external view returns (bool);
}

contract KNYBet2 is Ownable {
    IERC20 public immutable spiritToken;
    IKaijiNoYurei public immutable knyGame;

    struct Bet {
        address bettor;
        uint amount;
        address playerBetOn;
    }

    struct GameBetInfo {
        bool isSettled;
        uint totalPool;
        mapping(address => uint) betsOnPlayer;
        mapping(address => Bet[]) bettors;
    }

    mapping(uint => GameBetInfo) public gameBets;

    event BetPlaced(uint indexed gameId, address indexed bettor, address indexed playerBetOn, uint amount);
    event GameSettled(uint indexed gameId, address winner, uint reward);

    modifier onlyGame() {
        require(msg.sender == address(knyGame), "Unauthorized: Not KaijiNoYurei contract");
        _;
    }

    constructor(address _spiritToken, address _knyGame) Ownable(msg.sender) {
        spiritToken = IERC20(_spiritToken);
        knyGame = IKaijiNoYurei(_knyGame);
    }

    function placeBet(uint gameId, address playerBetOn, uint amount) external {
        require(knyGame.gameExists(gameId), "Game does not exist");
        require(amount > 0, "Bet amount must be greater than zero");

        GameBetInfo storage game = gameBets[gameId];
        require(!game.isSettled, "Betting closed for this game");

        // Transfer tokens to the contract as a bet
        spiritToken.transferFrom(msg.sender, address(this), amount);

        // Track bet
        game.totalPool += amount;
        game.betsOnPlayer[playerBetOn] += amount;
        game.bettors[playerBetOn].push(Bet(msg.sender, amount, playerBetOn));

        emit BetPlaced(gameId, msg.sender, playerBetOn, amount);
    }

    function settleBets(uint gameId, address winner) external onlyGame {
        GameBetInfo storage game = gameBets[gameId];
        require(!game.isSettled, "Game already settled");

        uint totalBetsOnWinner = game.betsOnPlayer[winner];
        require(totalBetsOnWinner > 0, "No bets on winner");

        uint platformFee = (game.totalPool * 5) / 100; // 5% platform fee
        uint remainingPool = game.totalPool - platformFee;

        for (uint i = 0; i < game.bettors[winner].length; i++) {
            Bet storage bet = game.bettors[winner][i];

            // Calculate reward proportionally
            uint bettorShare = (bet.amount * remainingPool) / totalBetsOnWinner;

            // Transfer winnings
            spiritToken.transfer(bet.bettor, bettorShare);
        }

        game.isSettled = true;

        emit GameSettled(gameId, winner, remainingPool);
    }
}

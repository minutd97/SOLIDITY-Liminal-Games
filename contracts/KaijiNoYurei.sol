// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat/console.sol";

contract KaijiNoYurei {
    uint constant PLAYER_LIMIT = 5;
    uint constant START_POINTS = 10;
    uint constant ROUND_TIME = 3 minutes;

    struct Player {
        uint points;
        bool hasSelectedNumber;
        uint selectedNumber;
    }

    struct Game {
        bool active;
        uint roundStartTime;
        address[] playerAddresses;
        mapping(address => Player) players;
    }

    Game public currentGame;

    event GameStarted();
    event RoundStarted(uint roundNumber);
    event RoundEnded(uint roundNumber);
    event PlayerEliminated(address player);
    event PlayerLostPoints(address player, uint pointsLost);
    event PlayerSelectedNumber(address player, uint number);

    modifier onlyActiveGame() {
        require(currentGame.active, "No active game");
        _;
    }

    function joinGame() external {
        require(!currentGame.active, "Game already started");
        require(currentGame.players[msg.sender].points == 0, "Player already joined");
        require(currentGame.playerAddresses.length < PLAYER_LIMIT, "Game is full");

        currentGame.players[msg.sender] = Player(START_POINTS, false, 0);
        currentGame.playerAddresses.push(msg.sender);
    }

    function startGame() external {
        require(!currentGame.active, "Game already active");
        require(currentGame.playerAddresses.length == PLAYER_LIMIT, "Not enough players to start the game");

        currentGame.active = true;
        emit GameStarted();
    }

    function startRound() external onlyActiveGame {
        require(currentGame.roundStartTime == 0, "Previous round not over");

        // Reset selections for the round
        for (uint i = 0; i < currentGame.playerAddresses.length; i++) {
            address playerAddr = currentGame.playerAddresses[i];
            Player storage player = currentGame.players[playerAddr];
            player.hasSelectedNumber = false;
            player.selectedNumber = 0;
        }

        currentGame.roundStartTime = block.timestamp;
        emit RoundStarted(currentGame.playerAddresses.length);
    }

    function selectNumber(uint number) external onlyActiveGame {
        require(number >= 0 && number <= 100, "Invalid number");
        Player storage player = currentGame.players[msg.sender];
        require(player.points > 0, "Player is eliminated");
        require(!player.hasSelectedNumber, "Number already selected");
        require(block.timestamp <= currentGame.roundStartTime + ROUND_TIME, "Time is up");

        player.hasSelectedNumber = true;
        player.selectedNumber = number;

        emit PlayerSelectedNumber(msg.sender, number);
    }

    function endRound() external onlyActiveGame {
        require(block.timestamp > currentGame.roundStartTime + ROUND_TIME, "Round time not over");

        uint sum = 0;
        uint validSelections = 0;
        uint activePlayers = 0;
        address[] memory playerAddresses = currentGame.playerAddresses;

        // Count active players and calculate sum for valid selections
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = currentGame.players[playerAddr];

            if (player.points > 0) {
                activePlayers++;
                if (player.hasSelectedNumber) {
                    sum += player.selectedNumber;
                    validSelections++;
                }
            }
        }

        require(validSelections > 0, "No valid selections this round");

        // Calculate target number with precision
        uint precision = 100; // Scale to 2 decimal places
        uint targetNumber = (sum * 8 * precision) / (10 * validSelections);
        console.log("Target Number (scaled):", targetNumber);

        // Base Game: Calculate closest player
        address[] memory closestPlayers = new address[](playerAddresses.length);
        uint closestDifference = type(uint).max;
        uint closestPlayerCount = 0;

        // Find the closest players to the target number
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = currentGame.players[playerAddr];

            if (player.hasSelectedNumber) {
                // Calculate the absolute difference with scaled precision
                uint scaledDifference = player.selectedNumber * precision > targetNumber
                    ? player.selectedNumber * precision - targetNumber
                    : targetNumber - player.selectedNumber * precision;

                if (scaledDifference < closestDifference) {
                    // New smallest difference found, reset closestPlayers list
                    closestDifference = scaledDifference;
                    closestPlayerCount = 1;
                    closestPlayers[0] = playerAddr;
                } else if (scaledDifference == closestDifference) {
                    // Another player with the same closest difference
                    closestPlayers[closestPlayerCount] = playerAddr;
                    closestPlayerCount++;
                }
            }
        }

        // Resize closestPlayers array to match the actual count of closest players
        assembly {
            mstore(closestPlayers, closestPlayerCount)
        }

        console.log("Closest players count:", closestPlayers.length);

        // Apply rules based on the number of active players
        if (activePlayers == 5) {
            handleEqualDistancePenalty(closestPlayers);
        }
        if (activePlayers <= 4) {
            handleDuplicatePenalty(playerAddresses);
        }
        if (activePlayers <= 3) {
            handleExactMatchRule(playerAddresses, targetNumber, precision);
        }
        if (activePlayers == 2) {
            handleZeroVsHundredRule(playerAddresses);
        }

        // Base Game: Penalize all players except the closest
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = currentGame.players[playerAddr];

            if (player.points > 0 && !isInArray(playerAddr, closestPlayers)) {
                player.points--;
                emit PlayerLostPoints(playerAddr, 1);

                if (player.points == 0) {
                    emit PlayerEliminated(playerAddr);
                }
            }
        }

        emit RoundEnded(activePlayers);
    }

    function handleEqualDistancePenalty(address[] memory closestPlayers) internal {
        for (uint i = 0; i < closestPlayers.length; i++) {
            address playerAddr = closestPlayers[i];
            Player storage player = currentGame.players[playerAddr];

            player.points--;
            emit PlayerLostPoints(playerAddr, 1);

            if (player.points == 0) {
                emit PlayerEliminated(playerAddr);
            }
        }
    }

    function handleDuplicatePenalty(address[] memory playerAddresses) internal {
        mapping(uint => uint) memory numberFrequency;

        // Count frequency of selected numbers
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = currentGame.players[playerAddr];

            if (player.hasSelectedNumber) {
                numberFrequency[player.selectedNumber]++;
            }
        }

        // Penalize players who selected duplicate numbers
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = currentGame.players[playerAddr];

            if (player.hasSelectedNumber && numberFrequency[player.selectedNumber] > 1) {
                player.points--;
                emit PlayerLostPoints(playerAddr, 1);

                if (player.points == 0) {
                    emit PlayerEliminated(playerAddr);
                }
            }
        }
    }

    function handleExactMatchRule(address[] memory playerAddresses, uint targetNumber, uint precision) internal {
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = currentGame.players[playerAddr];

            if (player.hasSelectedNumber && player.selectedNumber * precision == targetNumber) {
                // Exact match found
                for (uint j = 0; j < playerAddresses.length; j++) {
                    address otherPlayer = playerAddresses[j];
                    if (otherPlayer != playerAddr) {
                        Player storage other = currentGame.players[otherPlayer];
                        other.points -= 2;
                        emit PlayerLostPoints(otherPlayer, 2);

                        if (other.points == 0) {
                            emit PlayerEliminated(otherPlayer);
                        }
                    }
                }
                return; // Exit once the rule is applied
            }
        }
    }

    function handleZeroVsHundredRule(address[] memory playerAddresses) internal {
        address zeroPlayer;
        address hundredPlayer;

        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = currentGame.players[playerAddr];

            if (player.selectedNumber == 0) {
                zeroPlayer = playerAddr;
            } else if (player.selectedNumber == 100) {
                hundredPlayer = playerAddr;
            }
        }

        if (zeroPlayer != address(0) && hundredPlayer != address(0)) {
            currentGame.players[hundredPlayer].points++;
            currentGame.players[zeroPlayer].points--;

            emit PlayerLostPoints(zeroPlayer, 1);

            if (currentGame.players[zeroPlayer].points == 0) {
                emit PlayerEliminated(zeroPlayer);
            }
        }
    }

    function isInArray(address addr, address[] memory array) internal pure returns (bool) {
        for (uint i = 0; i < array.length; i++) {
            if (array[i] == addr) {
                return true;
            }
        }
        return false;
    }
}

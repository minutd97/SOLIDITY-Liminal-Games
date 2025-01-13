// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract KingOfDiamonds {
    uint constant PLAYER_LIMIT = 5;
    uint constant START_POINTS = 10;
    uint constant ROUND_TIME = 3 minutes;

    struct Player {
        uint points;
        bool hasSelectedNumber;
        uint selectedNumber;
    }

    struct Room {
        bool active;
        uint playerCount;
        uint roundCount;
        uint roundStartTime;
        mapping(address => Player) players;
        address[] playerAddresses;
    }

    uint public roomCount;
    mapping(uint => Room) public rooms;

    event RoomCreated(uint roomId);
    event PlayerJoined(uint roomId, address player);
    event GameStarted(uint roomId);
    event RoundStarted(uint roomId, uint roundNumber);
    event RoundEnded(uint roomId, uint roundNumber);
    event PlayerEliminated(uint roomId, address player);

    constructor() {
        createRoom(); // Create the initial room
    }

    function createRoom() public {
        roomCount++;
        Room storage newRoom = rooms[roomCount];
        newRoom.active = true;
        emit RoomCreated(roomCount);
    }

    function joinRoom() external {
        Room storage currentRoom = rooms[roomCount];
        require(currentRoom.playerCount < PLAYER_LIMIT, "Room is full");
        require(!currentRoom.active, "Game has already started");
        require(currentRoom.players[msg.sender].points == 0, "Player already in room");

        currentRoom.players[msg.sender] = Player(START_POINTS, false, 0);
        currentRoom.playerAddresses.push(msg.sender);
        currentRoom.playerCount++;

        emit PlayerJoined(roomCount, msg.sender);

        if (currentRoom.playerCount == PLAYER_LIMIT) {
            startGame();
        }
    }

    function startGame() public {
        Room storage currentRoom = rooms[roomCount];
        require(currentRoom.playerCount == PLAYER_LIMIT, "Room is not full");
        require(currentRoom.active, "Room is inactive");

        currentRoom.roundCount = 0;
        currentRoom.active = true;

        createRoom(); // Automatically create the next room for new players
        emit GameStarted(roomCount);
    }

    function startRound() external {
        Room storage currentRoom = rooms[roomCount];
        require(currentRoom.active, "Game is not active");

        currentRoom.roundCount++;
        currentRoom.roundStartTime = block.timestamp;

        // Reset player selections for the new round
        for (uint i = 0; i < currentRoom.playerAddresses.length; i++) {
            address playerAddr = currentRoom.playerAddresses[i];
            currentRoom.players[playerAddr].hasSelectedNumber = false;
            currentRoom.players[playerAddr].selectedNumber = 0;
        }

        emit RoundStarted(roomCount, currentRoom.roundCount);
    }

    function selectNumber(uint number) external {
        require(number >= 0 && number <= 100, "Invalid number");

        Room storage currentRoom = rooms[roomCount];
        Player storage player = currentRoom.players[msg.sender];

        require(player.points > 0, "Player is eliminated");
        require(!player.hasSelectedNumber, "Number already selected");
        require(block.timestamp <= currentRoom.roundStartTime + ROUND_TIME, "Time is up");

        player.hasSelectedNumber = true;
        player.selectedNumber = number;
    }

    function endRound() external {
        Room storage currentRoom = rooms[roomCount];
        require(block.timestamp > currentRoom.roundStartTime + ROUND_TIME, "Round time not over");

        uint sum = 0;
        uint validSelections = 0;
        for (uint i = 0; i < currentRoom.playerAddresses.length; i++) {
            address playerAddr = currentRoom.playerAddresses[i];
            Player storage player = currentRoom.players[playerAddr];

            if (player.hasSelectedNumber) {
                sum += player.selectedNumber;
                validSelections++;
            }
        }

        uint targetNumber = (sum * 8) / (10 * validSelections);
        address closestPlayer;
        uint closestDifference = type(uint).max;

        for (uint i = 0; i < currentRoom.playerAddresses.length; i++) {
            address playerAddr = currentRoom.playerAddresses[i];
            Player storage player = currentRoom.players[playerAddr];

            if (player.hasSelectedNumber) {
                uint difference = player.selectedNumber > targetNumber
                    ? player.selectedNumber - targetNumber
                    : targetNumber - player.selectedNumber;

                if (difference < closestDifference) {
                    closestDifference = difference;
                    closestPlayer = playerAddr;
                }
            } else {
                player.points--; // Penalize for not selecting
            }
        }

        if (closestPlayer != address(0)) {
            currentRoom.players[closestPlayer].points++;
        }

        for (uint i = 0; i < currentRoom.playerAddresses.length; i++) {
            address playerAddr = currentRoom.playerAddresses[i];
            Player storage player = currentRoom.players[playerAddr];

            if (player.points == 0) {
                emit PlayerEliminated(roomCount, playerAddr);
                // Remove player from the game
            }
        }

        emit RoundEnded(roomCount, currentRoom.roundCount);
    }
}

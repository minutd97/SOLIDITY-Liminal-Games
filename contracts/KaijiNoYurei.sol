// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat/console.sol";

interface IRelayerVerifier {
    function getDecryptedNumbers(uint gameId, uint roundId) external view returns (uint[] memory);
}

contract KaijiNoYurei {
    uint constant PLAYER_LIMIT = 5;
    uint constant START_POINTS = 10;
    uint constant ROUND_TIME = 30 seconds;

    struct Player {
        uint points;
        bool hasSelectedNumber;
        string selectedNumberEncrypted;
        uint selectedNumber;
    }

    struct Game {
        bool active;
        uint roundId;
        uint roundStartTime;
        address[] playerAddresses;
        mapping(address => Player) players;
    }

    uint public gameCounter;
    mapping(uint => Game) public games;
    mapping(address => uint) public playerToGame; // Tracks which game a player is in

    address public relayerVerifier;

    event GameCreated(uint gameId);
    event GameStarted(uint gameId);
    event RoundStarted(uint gameId, uint roundId, uint endTime);
    event RoundEnded(uint gameId, uint roundId);
    event PlayerJoinedGame(uint gameId, address player);
    event PlayerSelectedNumber(uint gameId, address player);
    event PlayerLostPoints(uint gameId, address player, uint pointsLost);
    event PlayerEliminated(uint gameId, address player);
    event GameWon(uint gameId, address player);

    constructor(address _relayerVerifier) {
        relayerVerifier = _relayerVerifier;
        createNewGame();
    }

    modifier onlyActiveGame(uint gameId) {
        require(games[gameId].active, "No active game");
        _;
    }

    function createNewGame() internal {
        gameCounter++;
        games[gameCounter].active = false;
        emit GameCreated(gameCounter);
    }

    function joinGame() external {
        uint gameId = getAvailableGame();
        require(games[gameId].players[msg.sender].points == 0, "Player already joined");
        require(games[gameId].playerAddresses.length < PLAYER_LIMIT, "Game is full");
        
        games[gameId].players[msg.sender] = Player(START_POINTS, false, "", 0);
        games[gameId].playerAddresses.push(msg.sender);
        playerToGame[msg.sender] = gameId;
        emit PlayerJoinedGame(gameId, msg.sender);
    }

    function startGame(uint gameId) external {
        require(!games[gameId].active, "Game already active");
        require(games[gameId].playerAddresses.length == PLAYER_LIMIT, "Not enough players to start");

        games[gameId].active = true;
        games[gameId].roundId = 0;
        emit GameStarted(gameId);

        createNewGame(); // Prepare the next available game
    }

    function startRound(uint gameId) public onlyActiveGame(gameId) {
        require(games[gameId].roundStartTime == 0, "Previous round not over");
        
        for (uint i = 0; i < games[gameId].playerAddresses.length; i++) {
            address playerAddr = games[gameId].playerAddresses[i];
            Player storage player = games[gameId].players[playerAddr];
            player.hasSelectedNumber = false;
            player.selectedNumberEncrypted = "";
        }

        games[gameId].roundId++;
        games[gameId].roundStartTime = block.timestamp;
        emit RoundStarted(gameId, games[gameId].roundId, block.timestamp + ROUND_TIME);
    }

    function selectNumber(uint gameId, string memory encryptedNumber) external onlyActiveGame(gameId) {
        Player storage player = games[gameId].players[msg.sender];
        require(player.points > 0, "Player is eliminated");
        require(!player.hasSelectedNumber, "Number already selected");
        require(block.timestamp <= games[gameId].roundStartTime + ROUND_TIME, "Time is up");

        player.selectedNumberEncrypted = encryptedNumber;
        player.hasSelectedNumber = true;

        emit PlayerSelectedNumber(gameId, msg.sender);
    }

    function processRound(uint gameId) external onlyActiveGame(gameId) {
        require(block.timestamp > games[gameId].roundStartTime + ROUND_TIME, "Round time not over");

        setNumbersToPlayers(gameId);

        uint sum = 0;
        uint validSelections = 0;
        uint activePlayers = 0;
        address[] memory playerAddresses = games[gameId].playerAddresses;

        // Count active players and calculate sum for valid selections
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = games[gameId].players[playerAddr];

            if (player.points > 0) {
                activePlayers++;
                if (player.hasSelectedNumber) {
                    sum += player.selectedNumber;
                    validSelections++;
                }
            }
        }

        // Check timeout conditions
        if (validSelections < activePlayers) {
            // Majority timeout rule
            if (applyTimeoutPenalty(gameId, playerAddresses, activePlayers)){
                endRound(gameId);
                return;
            }          
        }

        // Calculate target number with precision
        uint precision = 100; // Scale to 2 decimal places
        uint targetNumber = (sum * 8 * precision) / (10 * validSelections);
        console.log("Target Number (scaled):", targetNumber);

        // Handle rules based on player count
        if(activePlayers <= 3){
            //Exact Match Override: No additional rules applied
            if (handleExactMatchRule(gameId, playerAddresses, targetNumber, precision)) {
                endRound(gameId);
                return;
            }
        }

        bool baseRuleGetsApplied = true;
        if (activePlayers <= 5){
            baseRuleGetsApplied = handleClosestTiePenalty(gameId, playerAddresses, targetNumber, precision);
        }

        if (activePlayers <= 2){
            if (baseRuleGetsApplied)
                baseRuleGetsApplied = handleExtremeBluffRule(gameId, playerAddresses);
            else
                handleExtremeBluffRule(gameId, playerAddresses);
        }

        if(baseRuleGetsApplied){
            // Apply Base Rule: Penalize players not closest to target number
            applyBaseRule(gameId, playerAddresses, targetNumber, precision);
        }

        endRound(gameId);
    }

    function endRound(uint gameId) internal {
        Game storage currentGame = games[gameId];
        currentGame.roundStartTime = 0;
        returnPlayerPoints(gameId);

        emit RoundEnded(gameId, currentGame.roundId);
        address[] memory playerAddresses = currentGame.playerAddresses;

        // First, count how many players still have points
        uint playerCount = 0;
        address playerWonAddress;
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = currentGame.players[playerAddr];

            if (player.points > 0) {
                playerCount++;
                playerWonAddress = playerAddr; // Store last player found
            }
        }

        if (playerCount > 1) {
            startRound(gameId);
            return;
        } else if (playerCount == 1) {
            console.log("Game Won by Player:", playerWonAddress);
            emit GameWon(gameId, playerWonAddress);
        } else {
            console.log("There are no winners for this game");
        }

        console.log("Game Clear");
    }

    function setNumbersToPlayers(uint gameId) internal {
        uint[] memory decryptedNumbers = IRelayerVerifier(relayerVerifier).getDecryptedNumbers(gameId, games[gameId].roundId);
        for (uint i = 0; i < games[gameId].playerAddresses.length; i++) {
            address playerAddr = games[gameId].playerAddresses[i];
            Player storage player = games[gameId].players[playerAddr];

            if (player.hasSelectedNumber) {
                player.selectedNumber = decryptedNumbers[i];
            }
        }
    }

    //PLEASE REMOVE THIS IN PRODUCTION
    function returnPlayerPoints(uint gameId) public view {
        address[] memory playersAddr = games[gameId].playerAddresses;
        for (uint i = 0; i < playersAddr.length; i++){
            console.log("Player", (i + 1), "Points Left:", games[gameId].players[playersAddr[i]].points);
        }
    }

    function penalizePlayer(uint gameId, address playerAddr, uint points) internal {
        Player storage player = games[gameId].players[playerAddr];
        
        if (player.points > 0){
            if (player.points < points){
                player.points = 0;
            }    
            else{
                player.points -= points;
            }
                
            emit PlayerLostPoints(gameId, playerAddr, points);
            //console.log("Player Penalized : ", playerAddr, " Points left:", player.points);

            if (player.points == 0) {
                emit PlayerEliminated(gameId, playerAddr);
                console.log("Player Eliminated : ", playerAddr, " gameId:", gameId);
            }    
        }
    }

    function applyTimeoutPenalty(uint gameId, address[] memory playerAddresses, uint activePlayers) internal returns(bool) {
        uint timeoutCount = 0;

        // Apply timeout penalty
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = games[gameId].players[playerAddr];

            if (!player.hasSelectedNumber && player.points > 0) {
                penalizePlayer(gameId, playerAddr, 2);
                timeoutCount++;
            }
        }

        if(activePlayers == 2){
            console.log("Majority Timeout Rule applied, 1v1 case");
            return true;
        }

        // Apply Majority Timeout Rule
        if (timeoutCount * 100 / activePlayers >= 60) {
            console.log("Majority Timeout Rule applied");
            return true;
        }
        return false;
    }

    function handleClosestTiePenalty(uint gameId, address[] memory playerAddresses, uint targetNumber, uint precision) internal returns(bool) {
        uint closestDifference = type(uint).max;
        address[] memory closestPlayers = new address[](playerAddresses.length);
        uint closestPlayerCount = 0;

        // Find closest players
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = games[gameId].players[playerAddr];

            if (player.hasSelectedNumber) {
                uint scaledDifference = player.selectedNumber * precision > targetNumber
                    ? player.selectedNumber * precision - targetNumber
                    : targetNumber - player.selectedNumber * precision;

                if (scaledDifference < closestDifference) {
                    closestDifference = scaledDifference;
                    closestPlayerCount = 1;
                    closestPlayers[0] = playerAddr;
                } else if (scaledDifference == closestDifference) {
                    closestPlayers[closestPlayerCount] = playerAddr;
                    closestPlayerCount++;
                }
            }
        }

        if(closestPlayerCount > 1){
            // Penalize all closest players
            for (uint i = 0; i < closestPlayerCount; i++) {
                address playerAddr = closestPlayers[i];
                penalizePlayer(gameId, playerAddr, 1);
            }
            console.log("Handled Closest Tie Penalty");
            return false;
        }
        else{
            return true;
        }
    }

    function handleExactMatchRule(uint gameId, address[] memory playerAddresses, uint targetNumber, uint precision) internal returns (bool) {
        address exactMatchPlayer;
        uint exactMatchCount = 0;

        // Find exact matches for the targetNumber
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = games[gameId].players[playerAddr];

            if (player.hasSelectedNumber && player.selectedNumber * precision == targetNumber) {
                exactMatchPlayer = playerAddr;
                exactMatchCount++;

                // Exit early if more than one exact match is found
                if (exactMatchCount > 1) {
                    return false;
                }
            }
        }

        // If no exact matches, return false
        if (exactMatchCount == 0) {
            return false;
        }

        // Penalize all other players
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = games[gameId].players[playerAddr];

            if (player.hasSelectedNumber && playerAddr != exactMatchPlayer) {
                penalizePlayer(gameId, playerAddr, 2);
            }
        }

        console.log("Handled Exact Match Override Rule");
        return true; // Exact Match Override Rule
    }

    function handleExtremeBluffRule(uint gameId, address[] memory playerAddresses) internal returns (bool) {
        address zeroPlayer;
        address hundredPlayer;

        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = games[gameId].players[playerAddr];

            if (player.selectedNumber == 0 && player.hasSelectedNumber) {
                zeroPlayer = playerAddr;
            }

            if (player.selectedNumber == 100 && player.hasSelectedNumber) {
                hundredPlayer = playerAddr;
            }
        }

        if (zeroPlayer != address(0) && hundredPlayer != address(0)) {
            penalizePlayer(gameId, zeroPlayer, 1);
            console.log("Handled Extreme Bluff Rule");
            return false;
        }
        else{
            return true;
        }
    }

    function applyBaseRule(uint gameId, address[] memory playerAddresses, uint targetNumber, uint precision) internal {
        uint closestDifference = type(uint).max;
        address closestPlayer;
        bool foundClosestPlayer = false;

        // Identify the closest player to the target number
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = games[gameId].players[playerAddr];

            if (player.hasSelectedNumber) {
                uint scaledDifference = player.selectedNumber * precision > targetNumber
                    ? player.selectedNumber * precision - targetNumber
                    : targetNumber - player.selectedNumber * precision;

                if (scaledDifference < closestDifference) {
                    closestDifference = scaledDifference;
                    closestPlayer = playerAddr;
                    foundClosestPlayer = true;
                }
            }
        }

        // Penalize all players that had a valid number except the closest one
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = games[gameId].players[playerAddr];

            if (player.points > 0 && playerAddr != closestPlayer && player.hasSelectedNumber) {
                penalizePlayer(gameId, playerAddr, 1);
            }
        }

        // Emit closest player event for debugging
        if (foundClosestPlayer) {
            console.log("BASE RULE, Closest Player:", closestPlayer, "with Difference:", closestDifference);
        }
    }

    function getEncryptedNumbers(uint gameId) external view returns (string[] memory) {
        uint playerCount = games[gameId].playerAddresses.length;
        string[] memory encryptedNumbers = new string[](playerCount);

        for (uint i = 0; i < playerCount; i++) {
            address playerAddr = games[gameId].playerAddresses[i];
            encryptedNumbers[i] = games[gameId].players[playerAddr].selectedNumberEncrypted;
        }

        return encryptedNumbers;
    }

    function getAvailableGame() internal view returns (uint) {
        for (uint i = 1; i <= gameCounter; i++) {
            if (!games[i].active && games[i].playerAddresses.length < PLAYER_LIMIT) {
                return i;
            }
        }
        return gameCounter; // Return the latest game if no open ones
    }

    // function getGameData() external view returns (uint roundId, uint endTime) {
    //     return (currentGame.roundId, currentGame.roundStartTime + ROUND_TIME);
    // }
}

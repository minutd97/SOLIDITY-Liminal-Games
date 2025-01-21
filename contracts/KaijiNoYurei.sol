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
    event GameWon(address player);

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
        
        player.selectedNumber = number;
        player.hasSelectedNumber = true;

        emit PlayerSelectedNumber(msg.sender, number);
    }

    function processRound() external onlyActiveGame {
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

        // Check timeout conditions
        if (validSelections < activePlayers) {
            // Majority timeout rule
            if (applyTimeoutPenalty(playerAddresses, activePlayers)){
                endRound(activePlayers, playerAddresses);
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
            if (handleExactMatchRule(playerAddresses, targetNumber, precision)) {
                endRound(activePlayers, playerAddresses);
                return;
            }
        }

        bool baseRuleGetsApplied = true;
        if (activePlayers <= 5){
            baseRuleGetsApplied = handleClosestTiePenalty(playerAddresses, targetNumber, precision);
        }

        if (activePlayers <= 2){
            if (baseRuleGetsApplied)
                baseRuleGetsApplied = handleExtremeBluffRule(playerAddresses);
            else
                handleExtremeBluffRule(playerAddresses);
        }

        if(baseRuleGetsApplied){
            // Apply Base Rule: Penalize players not closest to target number
            applyBaseRule(playerAddresses, targetNumber, precision);
        }

        endRound(activePlayers, playerAddresses);
    }

    function endRound(uint activePlayers, address[] memory playerAddresses) internal {
        currentGame.roundStartTime = 0;
        emit RoundEnded(activePlayers);
        returnPlayerPoints();
        checkForWinner(playerAddresses);
    }

    //PLEASE REMOVE THIS IN PRODUCTION
    function returnPlayerPoints() public view {
        address[] memory playersAddr = currentGame.playerAddresses;
        for (uint i = 0; i < playersAddr.length; i++){
            console.log("Player", (i + 1), "Points Left:", currentGame.players[playersAddr[i]].points);
        }
    }

    function penalizePlayer(address playerAddr, uint points) internal {
        Player storage player = currentGame.players[playerAddr];
        
        if (player.points > 0){
            if (player.points < points){
                player.points = 0;
            }    
            else{
                player.points -= points;
            }
                
            emit PlayerLostPoints(playerAddr, points);
            //console.log("Player Penalized : ", playerAddr, " Points left:", player.points);

            if (player.points == 0) {
                emit PlayerEliminated(playerAddr);
                console.log("Player Eliminated : ", playerAddr);
            }    
        }
    }

    function applyTimeoutPenalty(address[] memory playerAddresses, uint activePlayers) internal returns(bool) {
        uint timeoutCount = 0;

        // Apply timeout penalty
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = currentGame.players[playerAddr];

            if (!player.hasSelectedNumber && player.points > 0) {
                penalizePlayer(playerAddr, 2);
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

    function handleClosestTiePenalty(address[] memory playerAddresses, uint targetNumber, uint precision) internal returns(bool) {
        uint closestDifference = type(uint).max;
        address[] memory closestPlayers = new address[](playerAddresses.length);
        uint closestPlayerCount = 0;

        // Find closest players
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = currentGame.players[playerAddr];

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
                penalizePlayer(playerAddr, 1);
            }
            console.log("Handled Closest Tie Penalty");
            return false;
        }
        else{
            return true;
        }
    }

    function handleExactMatchRule(address[] memory playerAddresses, uint targetNumber, uint precision) internal returns (bool) {
        address exactMatchPlayer;
        uint exactMatchCount = 0;

        // Find exact matches for the targetNumber
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = currentGame.players[playerAddr];

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
            Player storage player = currentGame.players[playerAddr];

            if (player.hasSelectedNumber && playerAddr != exactMatchPlayer) {
                penalizePlayer(playerAddr, 2);
            }
        }

        console.log("Handled Exact Match Override Rule");
        return true; // Exact Match Override Rule
    }

    function handleExtremeBluffRule(address[] memory playerAddresses) internal returns (bool) {
        address zeroPlayer;
        address hundredPlayer;

        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = currentGame.players[playerAddr];

            if (player.selectedNumber == 0 && player.hasSelectedNumber) {
                zeroPlayer = playerAddr;
            }

            if (player.selectedNumber == 100 && player.hasSelectedNumber) {
                hundredPlayer = playerAddr;
            }
        }

        if (zeroPlayer != address(0) && hundredPlayer != address(0)) {
            penalizePlayer(zeroPlayer, 1);
            console.log("Handled Extreme Bluff Rule");
            return false;
        }
        else{
            return true;
        }
    }

    function applyBaseRule(address[] memory playerAddresses, uint targetNumber, uint precision) internal {
        uint closestDifference = type(uint).max;
        address closestPlayer;
        bool foundClosestPlayer = false;

        // Identify the closest player to the target number
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = currentGame.players[playerAddr];

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
            Player storage player = currentGame.players[playerAddr];

            if (player.points > 0 && playerAddr != closestPlayer && player.hasSelectedNumber) {
                penalizePlayer(playerAddr, 1);
            }
        }

        // Emit closest player event for debugging
        if (foundClosestPlayer) {
            console.log("BASE RULE, Closest Player:", closestPlayer, "with Difference:", closestDifference);
        }
    }

    function checkForWinner(address[] memory playerAddresses) internal {
        //Count how many players still have points
        uint playerCount = 0;
        address playerWonAddress;
        for (uint i = 0; i < playerAddresses.length; i++) {
            address playerAddr = playerAddresses[i];
            Player storage player = currentGame.players[playerAddr];

            if (player.points > 0) {
                playerCount++;
                
                if (playerCount > 1) {  // Exit early if there are still at least 2 players with points
                    return;
                }
                else { 
                    playerWonAddress = playerAddr;
                }
            }
        }

        if (playerCount == 0){
            console.log("There are no winners for this game");
        }
        else{
            console.log("Game Won by Player:", playerWonAddress);
            emit GameWon(playerWonAddress);
        }
        console.log("Game Clear");
    }
}

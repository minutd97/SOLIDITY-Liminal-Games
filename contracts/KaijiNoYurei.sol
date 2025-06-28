// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
//import "hardhat/console.sol";

interface IGameTreasury {
    function addGameFee(address token, uint256 amount) external;
    function addLiquidityFee(address token, uint256 amount) external;
}

interface IKNYRelayerVerifier {
    function getDecryptedNumbers(uint gameId, uint roundId) external view returns (uint[] memory);
}

contract KaijiNoYurei is Ownable, ReentrancyGuard {
    IERC20 public immutable spiritToken;
    address public immutable gameTreasury;
    address public immutable relayerVerifier;
    
    uint constant PLAYER_LIMIT = 5;
    uint constant START_POINTS = 10;
    uint constant ROUND_TIME = 30 seconds;
    uint constant MAX_GAMES_PER_PLAYER = 5;

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

    // Tracks games for each player (fixed-size array)
    mapping(address => uint[5]) public playerToGames;

    // Tracks number of active games per player
    mapping(address => uint8) public playerGameCount;

    // Fees in basis points (e.g. 150 = 1.5%, 500 = 5%)
    uint256 public gameFeeBps = 150;
    uint256 public liquidityFeeBps = 500;

    // Entry fee (can be adjusted in future)
    uint256 public spiritEntryFee = 100 * 1e18;

    event GameCreated(uint gameId);
    event GameStarted(uint gameId);
    event RoundStarted(uint gameId, uint roundId, uint endTime);
    event RoundEnded(uint gameId, uint roundId);
    event PlayerJoinedGame(uint gameId, address player, uint playerCount);
    event PlayerSelectedNumber(uint gameId, address player);
    event PlayerLostPoints(uint gameId, address player, uint pointsLeft);
    event PlayerEliminated(uint gameId, address player);
    event GameWon(uint gameId, address player);
    event GameClear(uint gameId);

    constructor(address _relayerVerifier, address _spiritToken, address _gameTreasury) Ownable(msg.sender) {
        relayerVerifier = _relayerVerifier;
        spiritToken = IERC20(_spiritToken);
        gameTreasury = _gameTreasury;
        createNewGame();
    }

    // function getPlayerToGameKey(uint gameId, address player) internal pure returns (bytes32) {
    //     return keccak256(abi.encodePacked(gameId, player));
    // }

    modifier onlyActiveGame(uint gameId) {
        require(games[gameId].active, "No active game");
        _;
    }

    function setSpiritEntryFee(uint256 fee) external onlyOwner {
        spiritEntryFee = fee;
    }

    function setGameFeeBps(uint256 bps) external onlyOwner {
        require(bps <= 1000, "Too high"); // Max 10%
        gameFeeBps = bps;
    }

    function setLiquidityFeeBps(uint256 bps) external onlyOwner {
        require(bps <= 1000, "Too high"); // Max 10%
        liquidityFeeBps = bps;
    }

    function createNewGame() internal {
        gameCounter++;
        games[gameCounter].active = false;
        emit GameCreated(gameCounter);
    }

    // !!!!!!!!!!! SA DAM APPROVE LA NR MAXIM DE SPIRIT TOKEN INCA DIN DEPLOY CA SA SALVAM GAZ
    function joinGame() external nonReentrant {
        uint gameId = getAvailableGame();
        require(playerGameCount[msg.sender] < MAX_GAMES_PER_PLAYER, "The maximum game participation limit per player has been reached. Please wait for at least one of the five ongoing games to conclude before attempting to join another.");
        require(games[gameId].players[msg.sender].points == 0, "Player already joined");
        require(games[gameId].playerAddresses.length < PLAYER_LIMIT, "Game is full");
        require(spiritToken.transferFrom(msg.sender, address(this), spiritEntryFee), "SPIRIT transfer failed");
        
        games[gameId].players[msg.sender] = Player(START_POINTS, false, "", 0);
        games[gameId].playerAddresses.push(msg.sender);
        addPlayerToGame(gameId, msg.sender);
        emit PlayerJoinedGame(gameId, msg.sender, games[gameId].playerAddresses.length);
    }

    function startGame(uint gameId) external onlyOwner {
        require(!games[gameId].active, "Game already active");
        require(games[gameId].playerAddresses.length == PLAYER_LIMIT, "Not enough players to start");

        games[gameId].active = true;
        games[gameId].roundId = 0;

        emit GameStarted(gameId);
        createNewGame(); // Prepare the next available game
    }

    function startRound(uint gameId) public onlyOwner onlyActiveGame(gameId) {
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

    function selectNumber(uint gameId, string memory encryptedNumber) external nonReentrant onlyActiveGame(gameId) {
        Player storage player = games[gameId].players[msg.sender];
        require(player.points > 0, "Player is eliminated");
        require(!player.hasSelectedNumber, "Number already selected");
        require(block.timestamp <= games[gameId].roundStartTime + ROUND_TIME, "Time is up");

        player.selectedNumberEncrypted = encryptedNumber;
        player.hasSelectedNumber = true;

        emit PlayerSelectedNumber(gameId, msg.sender);
    }

    function processRound(uint gameId) external onlyOwner onlyActiveGame(gameId) {
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
            // Winner takes the full SPIRIT pool (5 players x entry fee)
            uint256 totalReward = PLAYER_LIMIT * spiritEntryFee;

            // Calculate fees
            uint256 gameFee = (totalReward * gameFeeBps) / 10_000;
            uint256 liquidityFee = (totalReward * liquidityFeeBps) / 10_000;
            uint256 remainingReward = totalReward - gameFee - liquidityFee;

            // Transfer fees
            spiritToken.approve(gameTreasury, gameFee + liquidityFee);
            IGameTreasury(gameTreasury).addGameFee(address(spiritToken), gameFee);
            IGameTreasury(gameTreasury).addLiquidityFee(address(spiritToken), liquidityFee);

            // Send reward to the winner
            require(spiritToken.transfer(playerWonAddress, remainingReward), "SPIRIT reward transfer failed");

            emit GameWon(gameId, playerWonAddress);
        } else {
            // No winners for this game
        }

        emit GameClear(gameId);
    }

    function setNumbersToPlayers(uint gameId) internal {
        uint[] memory decryptedNumbers = IKNYRelayerVerifier(relayerVerifier).getDecryptedNumbers(gameId, games[gameId].roundId);
        for (uint i = 0; i < games[gameId].playerAddresses.length; i++) {
            address playerAddr = games[gameId].playerAddresses[i];
            Player storage player = games[gameId].players[playerAddr];

            if (player.hasSelectedNumber) {
                player.selectedNumber = decryptedNumbers[i];
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
            return true;
        }

        // Apply Majority Timeout Rule
        if (timeoutCount * 100 / activePlayers >= 60) {
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
            return false;
        }
        else{
            return true;
        }
    }

    function applyBaseRule(uint gameId, address[] memory playerAddresses, uint targetNumber, uint precision) internal {
        uint closestDifference = type(uint).max;
        address closestPlayer;

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
                
            emit PlayerLostPoints(gameId, playerAddr, player.points);

            if (player.points == 0) {
                eliminatePlayerFromGame(gameId, playerAddr);
                emit PlayerEliminated(gameId, playerAddr);
            }    
        }
    }

    function addPlayerToGame(uint gameId, address player) internal {
        uint[5] storage playerGames = playerToGames[player];
        for(uint i = 0; i < playerGames.length; i++){
            if(playerGames[i] == 0){
                playerGames[i] = gameId;
                playerGameCount[player]++;
                return; // Once we found an empty slot, exit the function
            }
        }
    }

    function eliminatePlayerFromGame(uint gameId, address player) internal {
        uint[5] storage playerGames = playerToGames[player];
        for(uint i = 0; i < playerGames.length; i++){
            if(playerGames[i] == gameId){
                playerGames[i] = 0;
                playerGameCount[player]--;
                return; // Exit early after removing the player
            }
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

    // function playerInGame(uint gameId, address player) external view returns (bool) {
    //     bytes32 key = getPlayerToGameKey(gameId, player);
    //     return isInGame[key];
    // }

    // function getPlayerGameId(address playerAddress) external view returns (uint){
    //     return playerToGame[playerAddress];
    // }

    // function getGameData() external view returns (uint roundId, uint endTime) {
    //     return (currentGame.roundId, currentGame.roundStartTime + ROUND_TIME);
    // }
}

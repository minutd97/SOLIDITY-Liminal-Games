const { ethers } = require("hardhat");
const EthCrypto = require("eth-crypto");
require("dotenv").config();

async function playerBot() {
    const provider = new ethers.JsonRpcProvider(process.env.HARDHAT_RPC_URL);
    const KAIJI_NO_YUREI = process.env.KAIJI_NO_YUREI;
    const kaijiNoYurei = await ethers.getContractAt("KaijiNoYurei", KAIJI_NO_YUREI);
    
    let gameID = null;
    let timeoutId = null; // Track timeout for selecting numbers

    kaijiNoYurei.on("PlayerJoinedGame", handlePlayerJoined);
    kaijiNoYurei.on("RoundStarted", handleRoundStarted);

    // Create new player wallet
    const wallet = ethers.Wallet.createRandom().connect(provider);
    console.log(`🆕 New player created: ${wallet.address}`);

    // Fund wallet with some ETH
    await fundWallet(wallet);

    // Join game
    await kaijiNoYurei.connect(wallet).joinGame();
    console.log(`✅ Player ${wallet.address} joined a game.`);

    async function selectNumbers() {
        try {
            if (!gameID) {
                console.warn(`⚠️ Player ${wallet.address} has no assigned game.`);
                return;
            }

            let playerInGame = await kaijiNoYurei.playerInGame(gameID, wallet.address);
            if (playerInGame == false) {
                return; // The player was eliminated.
            }

            const randomNumber = Math.floor(Math.random() * 101);
            const encryptedNumber = await encryptNumber(randomNumber);

            console.log(`🎲 Player ${wallet.address} selecting ${randomNumber} for game ${gameID}...`);
            const tx = await kaijiNoYurei.connect(wallet).selectNumber(gameID, encryptedNumber);
            await tx.wait();
            console.log(`✅ Player ${wallet.address} successfully selected ${randomNumber}`);
        } catch (error) {
            console.error(`❌ Error selecting number for Player ${wallet.address}:`, error.message);
        }
    }

    async function encryptNumber(number) {
        const publicKey = EthCrypto.publicKeyByPrivateKey(process.env.HARDHAT_RELAYER_PRIVATE_KEY);
        const encrypted = await EthCrypto.encryptWithPublicKey(publicKey, JSON.stringify(number));
        return `${encrypted.iv}:${encrypted.ephemPublicKey}:${encrypted.ciphertext}:${encrypted.mac}`;
    }

    async function fundWallet(wallet) {
        const [funder] = await ethers.getSigners(); // Get Hardhat's default signer
        const tx = await funder.sendTransaction({
            to: wallet.address,
            value: ethers.parseEther("0.1"),
        });
        await tx.wait();
    }    

    // Listen for PlayerJoinedGame event
    function handlePlayerJoined(eventGameId, player, playerCount) {
        if (player.toLowerCase() == wallet.address.toLowerCase()) {
            gameID = Number(eventGameId);
            console.log(`🎯 Player ${wallet.address} assigned to Game ID: ${gameID}`);
            kaijiNoYurei.off("PlayerJoinedGame", handlePlayerJoined); // Stop listening once found
        }
    }
    
    function handleRoundStarted(eventGameId, roundId, time) {
        if (eventGameId == gameID) {
            console.log(`🔥 Round Started! Game: ${gameID}, Round: ${roundId}`);

            if (timeoutId) {
                clearTimeout(timeoutId); // Ensure previous timeout is cleared
                console.log(`⏹️ Stopped previous execution timer for ${wallet.address}`);
            }

            // Schedule one execution within 1s - 25s range
            const delay = Math.floor(Math.random() * (18000 - 1000) + 1000);
            timeoutId = setTimeout(() => {
                selectNumbers();
                timeoutId = null; // Reset after execution
            }, delay);

            console.log(`⏳ Player ${wallet.address} will select a number in ${delay / 1000} seconds.`);
        }
    }
}

module.exports = playerBot;

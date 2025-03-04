const { ethers } = require("hardhat");
const EthCrypto = require("eth-crypto");
require("dotenv").config();

async function playerBot() {
    //const provider = new ethers.WebSocketProvider("ws://127.0.0.1:8545/");
    const provider = new ethers.WebSocketProvider("ws://127.0.0.1:8545/");
    provider.pollingInterval = 100;
    const KAIJI_NO_YUREI = process.env.KAIJI_NO_YUREI;
    const kaijiNoYurei = await ethers.getContractAt("KaijiNoYurei", KAIJI_NO_YUREI, provider);
    
    //await waitForNewBlock();

    let gameID = null;
    let timeoutId = null; // Track timeout for selecting numbers
    let eliminated = false;

    kaijiNoYurei.on("PlayerJoinedGame", handlePlayerJoined);
    kaijiNoYurei.on("RoundStarted", handleRoundStarted);
    kaijiNoYurei.on("PlayerEliminated", handlePlayerEliminated);

    // Create new player wallet
    const wallet = ethers.Wallet.createRandom().connect(provider);
    console.log(`🆕 New player created: ${wallet.address}`);

    // Fund wallet with some ETH
    await fundWallet(wallet);

    // Join game
    await kaijiNoYurei.connect(wallet).joinGame(); //const tx = 
    //const receipt = await tx.wait();
    //console.log("📜 Transaction Receipt:", receipt);
    //console.log("📡 Events Emitted:", receipt.events);

    async function selectNumbers() {
        try {
            if (eliminated) // Player get's eliminated, just in case when unsubscribing it will take a moment and the event will still register
                return;

            if (!gameID) {
                console.warn(`⚠️ Player ${wallet.address} has no assigned game.`);
                return;
            }

            const randomNumber = Math.floor(Math.random() * 101);
            const encryptedNumber = await encryptNumber(randomNumber);

            //console.log(`🎲 Player ${wallet.address} selecting ${randomNumber} for game ${gameID}...`);
            const tx = await kaijiNoYurei.connect(wallet).selectNumber(gameID, encryptedNumber);
            await tx.wait();
            console.log(`✅🎲 Player ${wallet.address} successfully selected ${randomNumber}`);
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
        const funder = new ethers.Wallet(process.env.HARDHAT_OWNER_PRIVATE_KEY, provider); // Use private key
    
        const tx = await funder.sendTransaction({
            to: wallet.address,
            value: ethers.parseEther("0.1"),
        });
    
        await tx.wait();
        //console.log(`✅ Wallet ${wallet.address} funded with 0.1 ETH`);
    }
    
    // Listen for PlayerJoinedGame event
    function handlePlayerJoined(eventGameId, player, playerCount) {
        if (player.toLowerCase() == wallet.address.toLowerCase()) {
            gameID = BigInt(eventGameId);
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
            const delay = 5000;//Math.floor(Math.random() * (8000 - 1000) + 1000);
            timeoutId = setTimeout(() => {
                selectNumbers();
                timeoutId = null; // Reset after execution
            }, delay);

            //console.log(`⏳ Player ${wallet.address} will select a number in ${delay / 1000} seconds.`);
        }
    }

    function handlePlayerEliminated(eventGameId, player) {
        if (player.toLowerCase() == wallet.address.toLowerCase()){
            eliminated = true;
            kaijiNoYurei.off("PlayerJoinedGame", handlePlayerJoined);
            kaijiNoYurei.off("RoundStarted", handleRoundStarted);
            kaijiNoYurei.off("PlayerEliminated", handlePlayerEliminated);
        }
    }

    async function waitForNewBlock() {
        //console.log("⏳ Waiting for a new block...");
        const latestBlock = await provider.getBlockNumber();
    
        return new Promise((resolve) => {
            const interval = setInterval(async () => {
                const newBlock = await provider.getBlockNumber();
                if (newBlock > latestBlock) {
                    clearInterval(interval);
                    //console.log(`✅ New block detected: ${newBlock}`);
                    resolve();
                }
            }, 1500); // Check every 1.5 seconds
        });
    }
}

module.exports = playerBot;

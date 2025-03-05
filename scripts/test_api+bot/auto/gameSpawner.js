const playerBot = require("./playerBot");
const randomWalletPlaceBet = require("./placeBet");

async function startSpawningPlayers() {
    console.log("🚀 Game Spawner started! Groups of 5 players will join a new game at random intervals.");

    const provider = new ethers.JsonRpcProvider(process.env.LOCAL_RPC);
    provider.pollingInterval = 100;

    const KAIJI_NO_YUREI = process.env.KAIJI_NO_YUREI;
    const kaijiNoYurei = await ethers.getContractAt("KaijiNoYurei", KAIJI_NO_YUREI, provider);

    kaijiNoYurei.on("GameStarted", handleGameStarted);

    let walletPlayerToBet;

    async function handleGameStarted(_gameId) {
        await randomWalletPlaceBet(_gameId, walletPlayerToBet);
    }

    async function spawnPlayersGroup() {
        console.log("🎮 Spawning 5 players for a new game...");

        for (let i = 0; i < 5; i++) {
            walletPlayerToBet = await playerBot(); // Sequentially fund & start players
            await new Promise(resolve => setTimeout(resolve, 1000)); // Add 1s delay between each player
        }

        const nextSpawnTime = 30000; //Math.floor(Math.random() * (180000 - 30000) + 30000); // 30s - 3min
        console.log(`🕒 Next group of 5 players will join in ${nextSpawnTime / 1000} seconds...`);
        setTimeout(spawnPlayersGroup, nextSpawnTime);
    }

    spawnPlayersGroup();
}

startSpawningPlayers();
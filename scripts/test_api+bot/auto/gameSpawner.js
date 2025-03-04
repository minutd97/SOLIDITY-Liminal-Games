const playerBot = require("./playerBot");

async function startSpawningPlayers() {
    console.log("🚀 Game Spawner started! Groups of 5 players will join a new game at random intervals.");

    async function spawnPlayersGroup() {
        console.log("🎮 Spawning 5 players for a new game...");

        for (let i = 0; i < 5; i++) {
            await playerBot(); // Sequentially fund & start players
            await new Promise(resolve => setTimeout(resolve, 1000)); // Add 1s delay between each player
        }

        const nextSpawnTime = 30000; //Math.floor(Math.random() * (180000 - 30000) + 30000); // 30s - 3min
        console.log(`🕒 Next group of 5 players will join in ${nextSpawnTime / 1000} seconds...`);
        setTimeout(spawnPlayersGroup, nextSpawnTime);
    }

    spawnPlayersGroup();
}

startSpawningPlayers();
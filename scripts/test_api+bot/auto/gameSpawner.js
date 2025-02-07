const playerBot = require("./playerBot");

async function startSpawningPlayers() {
    console.log("🚀 Game Spawner started! Groups of 5 players will join a new game at random intervals.");

    async function spawnPlayersGroup() {
        console.log("🎮 Spawning 5 players for a new game...");

        const playerPromises = [];
        for (let i = 0; i < 5; i++) {
            playerPromises.push(playerBot()); // Spawn 5 players in parallel
        }
        await Promise.all(playerPromises);

        const nextSpawnTime = Math.floor(Math.random() * (180000 - 30000) + 30000); // 30s - 3min
        console.log(`🕒 Next group of 5 players will join in ${nextSpawnTime / 1000} seconds...`);
        setTimeout(spawnPlayersGroup, nextSpawnTime);
    }

    spawnPlayersGroup();
}

startSpawningPlayers();
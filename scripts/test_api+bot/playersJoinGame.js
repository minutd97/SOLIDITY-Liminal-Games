const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    const [owner, trustedRelayer, user1, user2, user3, user4, user5] = await ethers.getSigners();
    
    // Load contract addresses from .env
    const KAIJI_NO_YUREI = process.env.KAIJI_NO_YUREI;
    const kaijiNoYurei = await ethers.getContractAt("KaijiNoYurei", KAIJI_NO_YUREI);

    // console.log("🎮 Players joining the game...");

    await kaijiNoYurei.connect(user1).joinGame();
    await kaijiNoYurei.connect(user2).joinGame();
    await kaijiNoYurei.connect(user3).joinGame();
    await kaijiNoYurei.connect(user4).joinGame();
    await kaijiNoYurei.connect(user5).joinGame();

    console.log("✅ All players joined!");
}

main().catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
});

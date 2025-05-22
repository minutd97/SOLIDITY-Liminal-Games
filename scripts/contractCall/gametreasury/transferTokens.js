require("dotenv").config();
const { ethers } = require("hardhat");
const path = require("path");
const {
    getOwner,
    getProvider,
    sendTx,
    setTxLogging,
    log_TokenBalance,
    log_EthBalance
} = require(path.resolve(process.cwd(), "scripts/deployUtils"));
const {GAME_TREASURY} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const owner = new ethers.Wallet(getOwner(), provider);
        const GameTreasury = await ethers.getContractAt("GameTreasury", GAME_TREASURY, owner);

        const user = "0xD580273B481c6acb42eB979DF6a369eB657B1CE9";
        const amount = ethers.parseUnits("10000", 18);
        await sendTx(GameTreasury.connect(owner).transferTokens(user, amount), `Transfer amount of ${ethers.formatEther(amount)} LIM tokens to ${user}`);

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
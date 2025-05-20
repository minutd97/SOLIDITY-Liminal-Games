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
const {GAME_TREASURY, SPIRIT_TOKEN} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const owner = new ethers.Wallet(getOwner(), provider);
        const GameTreasury = await ethers.getContractAt("GameTreasury", GAME_TREASURY, owner);
        const SpiritToken = await ethers.getContractAt("SpiritToken", SPIRIT_TOKEN, owner);
        
        await log_TokenBalance(SpiritToken, "SPIRIT", owner.address, "Owner before");

        await sendTx(GameTreasury.collectGameFees(SPIRIT_TOKEN, owner.address), `Collect game fees`);

        await log_TokenBalance(SpiritToken, "SPIRIT", owner.address, "Owner after");

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
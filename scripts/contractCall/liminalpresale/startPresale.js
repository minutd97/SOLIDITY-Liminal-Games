require("dotenv").config();
const { ethers } = require("hardhat");
const path = require("path");
const {
    getProvider,
    sendTx,
    setTxLogging,
    log_TokenBalance,
    log_EthBalance
} = require(path.resolve(process.cwd(), "scripts/deployUtils"));
const {LIMINAL_PRESALE} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const owner = new ethers.Wallet(process.env.TESTNET_PRIVATE_KEY, provider);
        const LiminalPresale = await ethers.getContractAt("LiminalPresale", LIMINAL_PRESALE, owner);

        console.log("\n🚀 Starting presale...");

        const presaleDuration = 30 * 60; // 30 minutes
        await sendTx(LiminalPresale.connect(owner).startPresale(presaleDuration), `Starting presale with ${presaleDuration} duration`);

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
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
const {LIMINAL_PRESALE} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const owner = new ethers.Wallet(getOwner(), provider);
        const LiminalPresale = await ethers.getContractAt("LiminalPresale", LIMINAL_PRESALE, owner);

        for (let i = 0; i < 1; i++){
            const batchSize = 100;
            await sendTx(LiminalPresale.connect(owner).distributeTokens(batchSize), `Distributing tokens to users with batch size ${batchSize}`);
        }

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
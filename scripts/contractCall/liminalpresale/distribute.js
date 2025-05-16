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

const LIMINAL_PRESALE = "0x87B557e69173899F4A2948EA45a51FD0e54818C4";

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const owner = new ethers.Wallet(process.env.TESTNET_PRIVATE_KEY, provider);
        const LiminalPresale = await ethers.getContractAt("LiminalPresale", LIMINAL_PRESALE, owner);

        for (let i = 0; i < 1; i++){
            const batchSize = 100;
            await sendTx(LiminalPresale.connect(owner).distributeTokens(batchSize), `Distributing tokens to batch size ${batchSize}`);
        }

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
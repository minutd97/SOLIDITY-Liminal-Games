require("@nomicfoundation/hardhat-verify");
require("dotenv").config();
const { ethers } = require("hardhat");
const path = require("path");
const {
    getProvider,
    deployContract,
    sendTx,
    setTxLogging,
    verifyContract,
    log_TokenBalance,
    log_EthBalance
} = require(path.resolve(process.cwd(), "scripts/deployUtils"));

const LIMINAL_TOKEN = "0xD19Ed21D2AdCf76C8074716e484740a2197d9506";

async function deploy() {
    try {
        setTxLogging(false);
        const provider = getProvider();
        const owner = new ethers.Wallet(process.env.TESTNET_PRIVATE_KEY, provider);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, owner);

        console.log("\n🚀 Deploying contracts...");
        console.log(`Contracts Owner : ${owner.address}`);

        // Deploy KNYBet
        const knyBet = await deployContract("KNYBet", owner);
        await verifyContract(knyBet.target);
    
        console.log("✅ KNYBet Deployment Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ KNYBet Deployment failed:", error);
        process.exit(1);
    }
}

deploy();

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
const LIMINAL_TOKEN_DISTRIBUTOR = "0x257f48ED50E6DF84434EEAf23128F51fFd7c1146";

async function deploy() {
    try {
        setTxLogging(false);
        const provider = getProvider();
        const owner = new ethers.Wallet(process.env.TESTNET_PRIVATE_KEY, provider);
        const LiminalDistributor = await ethers.getContractAt("LiminalDistributor", LIMINAL_TOKEN_DISTRIBUTOR, owner);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, owner);

        console.log("\n🚀 Deploying contracts...");
        console.log(`Contracts Owner : ${owner.address}`);

        // Deploy LiminalStakingPool
        const liminalStakingPool = await deployContract("LiminalStakingPool", owner, [LIMINAL_TOKEN]);

        // Grant Liminal Distributor as the pool loader
        await sendTx(liminalStakingPool.connect(owner).grantLoaderRole(LIMINAL_TOKEN_DISTRIBUTOR), `Grant Liminal Distributor as the pool loader`);

        // Register the GameTreasury contract in the distributor
        await sendTx(LiminalDistributor.connect(owner).setLiminalStaking(liminalStakingPool.target), `Setting LiminalStakingPool address in distributor`);

        await log_TokenBalance(LiminalToken, "LIM", LIMINAL_TOKEN_DISTRIBUTOR, "Distributor");
        // Then trigger the token distribution
        await sendTx(LiminalDistributor.connect(owner).distributeToLiminalStaking(), `Distributing tokens to LiminalStakingPool`);

        await log_TokenBalance(LiminalToken, "LIM", LIMINAL_TOKEN_DISTRIBUTOR, "Distributor");
    
        console.log("✅ LiminalStakingPool Deployment Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ LiminalStakingPool Deployment failed:", error);
        process.exit(1);
    }
}

deploy();

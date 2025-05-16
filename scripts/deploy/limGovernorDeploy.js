require("@nomicfoundation/hardhat-verify");
require("dotenv").config();
const { ethers } = require("hardhat");
const path = require("path");
const {
    getOwner,
    getProvider,
    deployContract,
    sendTx,
    setTxLogging,
    verifyContract,
    log_TokenBalance,
    log_EthBalance
} = require(path.resolve(process.cwd(), "scripts/deployUtils"));
const {LIMINAL_TOKEN, LIMINAL_TOKEN_DISTRIBUTOR} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function deploy() {
    try {
        setTxLogging(false);
        const provider = getProvider();
        const owner = new ethers.Wallet(getOwner(), provider);
        const LiminalDistributor = await ethers.getContractAt("LiminalDistributor", LIMINAL_TOKEN_DISTRIBUTOR, owner);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, owner);

        console.log("\n🚀 Deploying contracts...");
        console.log(`Contracts Owner : ${owner.address}`);

        // Delegate to self to activate vote power
        await sendTx(LiminalToken.connect(owner).delegate(owner.address), `Delegate to self to activate vote power`);

        // Deploy LIMGovernor
        const limGovernor = await deployContract("LIMGovernor", owner, [LIMINAL_TOKEN]);
    
        console.log("✅ LIMGovernor Deployment Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ LIMGovernor Deployment failed:", error);
        process.exit(1);
    }
}

deploy();

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
const {LIMINAL_TOKEN, LIMINAL_STAKING_POOL} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const user = new ethers.Wallet(process.env.TESTNET_USER_PRIVATE_KEY, provider);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, user);
        const LiminalStakingPool = await ethers.getContractAt("LiminalStakingPool", LIMINAL_STAKING_POOL, user);

        await log_TokenBalance(LiminalToken, "LIM", user.address, "User");
        await sendTx(LiminalStakingPool.connect(user).claim(), `Claim LIM from staking pool`);
        await log_TokenBalance(LiminalToken, "LIM", user.address, "User");

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
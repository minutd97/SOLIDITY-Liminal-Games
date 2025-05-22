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

        const stakeAmount = ethers.parseUnits("1000", 18);

        await sendTx(LiminalToken.connect(user).approve(LIMINAL_STAKING_POOL, stakeAmount), `Approve ${stakeAmount} LIM to staking pool`);
        await sendTx(LiminalStakingPool.connect(user).stake(stakeAmount), `Stake ${stakeAmount} LIM to staking pool`);

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
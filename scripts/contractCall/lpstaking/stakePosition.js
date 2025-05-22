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
const {
    LIMINAL_TOKEN, 
    LP_STAKING_REWARDS,
    POSITION_MANAGER, 
    POSITION_MANAGER_ABI
} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const user = new ethers.Wallet(process.env.TESTNET_USER_PRIVATE_KEY, provider);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, user);
        const LPStakingRewards = await ethers.getContractAt("LPStakingRewards", LP_STAKING_REWARDS, user);
        
        const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, user);
        const tokenId = 0; // WE NEED TO KNOW THE POOL TOKEN ID!!!!

        await sendTx(positionManager.connect(user).approve(LP_STAKING_REWARDS, tokenId), `Approve tokenId ${tokenId} to position manager`);
        await sendTx(LPStakingRewards.connect(user).stake(tokenId), `Stake tokenId ${tokenId} lp staking rewards`);

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
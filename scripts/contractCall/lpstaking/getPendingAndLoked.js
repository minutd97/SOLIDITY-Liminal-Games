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
        const LPStakingRewards = await ethers.getContractAt("LPStakingRewards", LP_STAKING_REWARDS, user);
        
        const tokenId = 34; // WE NEED TO KNOW THE POOL TOKEN ID!!!!

        let [claim1, burn1] = await LPStakingRewards.getPending(tokenId);
        let locked1 = await LPStakingRewards.getLocked(tokenId);
        console.log("USER: claimable", ethers.formatUnits(claim1), "burnable", ethers.formatUnits(burn1), "locked", ethers.formatUnits(locked1));

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
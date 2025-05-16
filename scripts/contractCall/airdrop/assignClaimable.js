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
const {AIRDROP} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const owner = new ethers.Wallet(getOwner(), provider);
        const AirdropDistributor = await ethers.getContractAt("AirdropDistributor", AIRDROP, owner);

        const user = "0xD580273B481c6acb42eB979DF6a369eB657B1CE9";
        const amount = ethers.parseUnits("10000", 18);
        await sendTx(AirdropDistributor.connect(owner).setClaimable(user, amount), 
         `Set claimable for ${user} with an amount of ${ethers.formatEther(amount)}`);

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
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
const {TEAM_VESTING_VAULT, LIMINAL_TOKEN} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const owner = new ethers.Wallet(getOwner(), provider);
        const TeamVestingVault = await ethers.getContractAt("TeamVestingVault", TEAM_VESTING_VAULT, owner);
    
        const beneficiary = "0xD580273B481c6acb42eB979DF6a369eB657B1CE9";
        const amount = ethers.parseEther("100000"); // 100k

        await sendTx(TeamVestingVault.connect(owner).releaseTokensTo(beneficiary, LIMINAL_TOKEN, amount),
            `Fund beneficiary : ${beneficiary} , with LIM tokens ${ethers.formatEther(amount)}`);

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
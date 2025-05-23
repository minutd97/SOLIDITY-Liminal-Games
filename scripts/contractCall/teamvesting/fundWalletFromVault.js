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
    
        const beneficiary = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
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
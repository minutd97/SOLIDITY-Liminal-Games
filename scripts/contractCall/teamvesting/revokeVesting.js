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
const {TEAM_VESTING_CONTROLLER} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const owner = new ethers.Wallet(getOwner(), provider);
        const TeamVestingController = await ethers.getContractAt("TeamVestingController", TEAM_VESTING_CONTROLLER, owner);
    
        const beneficiary = "0xD580273B481c6acb42eB979DF6a369eB657B1CE9";
        await sendTx(TeamVestingController.connect(owner).revokeVesting(beneficiary), `Revoke vesting for : ${beneficiary}`);

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
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
const {TEAM_VESTING_CONTROLLER, LIMINAL_TOKEN} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const owner = new ethers.Wallet(getOwner(), provider);
        const TeamVestingController = await ethers.getContractAt("TeamVestingController", TEAM_VESTING_CONTROLLER, owner);

        const vesting_duration = 90 * 24 * 60 * 60; // 3 months
        const vesting_cliff = 900;//30 * 24 * 60 * 60; // 1 month
        const vestingAmount = ethers.parseEther("1000000"); // 1M
    
        const beneficiary = "0xD580273B481c6acb42eB979DF6a369eB657B1CE9";

        await sendTx(TeamVestingController.createVestingWallet(
            beneficiary,
            vesting_duration,
            vesting_cliff
        ), `Creating vesting wallet for: ${beneficiary}`);

        await sendTx(limToken.approve(TEAM_VESTING_CONTROLLER, vestingAmount),
            `Approve LIM tokens ${ethers.formatEther(vestingAmount)} to TeamVestingController`);

        await sendTx(TeamVestingController.connect(owner).fundERC20ToWallet(beneficiary, LIMINAL_TOKEN, vestingAmount),
            `Fund beneficiary : ${beneficiary} , with LIM tokens ${ethers.formatEther(vestingAmount)}`);

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
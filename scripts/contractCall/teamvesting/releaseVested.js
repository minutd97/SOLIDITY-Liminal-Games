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
        const user = new ethers.Wallet(process.env.TESTNET_USER_PRIVATE_KEY, provider);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, user);
        const TeamVestingController = await ethers.getContractAt("TeamVestingController", TEAM_VESTING_CONTROLLER, user);

        const beneficiary = "0xD580273B481c6acb42eB979DF6a369eB657B1CE9";

        const limBefore = await LiminalToken.balanceOf(user.address);
        await sendTx(TeamVestingController.releaseVestedERC20(beneficiary, LIMINAL_TOKEN), `Release vesting for: ${beneficiary}`);
        const limAfter = await LiminalToken.balanceOf(user.address);
    
        console.log("LIM collected:", ethers.formatEther(limAfter - limBefore));
        
        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
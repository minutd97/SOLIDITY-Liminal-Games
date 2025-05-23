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
const {LONG_TERM_RESERVE} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const owner = new ethers.Wallet(getOwner(), provider);
        const LongTermReserve = await ethers.getContractAt("LongTermReserve", LONG_TERM_RESERVE, owner);

        const releasable = await LongTermReserve.releasable();
        console.log(`Releasable tokens : ${ethers.formatEther(releasable)}`);

        const amount = ethers.parseUnits("10", 18);
        await sendTx(LongTermReserve.connect(owner).release(amount), 
         `Releasing an amount of ${ethers.formatEther(amount)}`);

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
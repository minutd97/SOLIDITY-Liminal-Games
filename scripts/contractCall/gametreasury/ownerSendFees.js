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
const {GAME_TREASURY, LIMINAL_TOKEN} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const owner = new ethers.Wallet(getOwner(), provider);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, owner);
        const GameTreasury = await ethers.getContractAt("GameTreasury", GAME_TREASURY, owner);

        // test game fee pool
        const testGameFeeAmount = ethers.parseUnits("1000", 18);
        await sendTx(LiminalToken.approve(GAME_TREASURY, testGameFeeAmount), `Approve ${testGameFeeAmount} LIM fee to treasury`);
        await sendTx(GameTreasury.connect(owner).receiveGameFeeTokens(testGameFeeAmount), `Send ${testGameFeeAmount} LIM fee to treasury`);

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
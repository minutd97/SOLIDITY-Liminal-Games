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
const {GAME_TREASURY, SPIRIT_TOKEN, SPIRIT_TOKEN_FACTORY} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const owner = new ethers.Wallet(getOwner(), provider);
        const GameTreasury = await ethers.getContractAt("GameTreasury", GAME_TREASURY, owner);
        const SpiritToken = await ethers.getContractAt("SpiritToken", SPIRIT_TOKEN, owner);
        const SpiritTokenFactory = await ethers.getContractAt("SpiritTokenFactory", SPIRIT_TOKEN_FACTORY, owner);

        await sendTx(GameTreasury.connect(owner).grantGameContractRole(owner.address), `Grant game contract role for testing`);

        const fee = ethers.parseUnits("1000", 18);
        await sendTx(SpiritTokenFactory.connect(owner).mintSpirit(fee * 2n), `Mint ${fee * 2n} SPIRIT to owner`);
        await sendTx(SpiritToken.approve(GAME_TREASURY, fee * 2n), `Approve ${fee * 2n} SPIRIT to game treasury`);

        await log_TokenBalance(SpiritToken, "SPIRIT", GAME_TREASURY, "Game treasury before");

        await sendTx(GameTreasury.addGameFee(SPIRIT_TOKEN, fee), `Add game fee`);
        await sendTx(GameTreasury.addLiquidityFee(SPIRIT_TOKEN, fee), `Add liquidity fee`);

        await log_TokenBalance(SpiritToken, "SPIRIT", GAME_TREASURY, "Game treasury after");

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
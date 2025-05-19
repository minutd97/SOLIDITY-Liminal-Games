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
///// WAITING FOR MODIFICATION DO TO SPIRIT TOKEN FACTORY!!!!
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
        await lim.approve(treasury.target, fee * 2n);
        await treasury.addGameFee(token, fee);
        await treasury.addLiquidityFee(token, fee);

        const user = "0xD580273B481c6acb42eB979DF6a369eB657B1CE9";
        const amount = ethers.parseUnits("10000", 18);
        await sendTx(GameTreasury.connect(owner).transferTokens(user, amount), 
         `Transfer amount of ${ethers.formatEther(amount)} LIM tokens to ${user}`);

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
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
const {SPIRIT_TOKEN, SPIRIT_TOKEN_FACTORY, LIMINAL_TOKEN} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const user = new ethers.Wallet(process.env.TESTNET_USER_PRIVATE_KEY, provider);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, user);
        const SpiritToken = await ethers.getContractAt("SpiritToken", SPIRIT_TOKEN, user);
        const SpiritTokenFactory = await ethers.getContractAt("SpiritTokenFactory", SPIRIT_TOKEN_FACTORY, user);

        const totalSpiritAmount = await SpiritToken.balanceOf(user.address)
        await sendTx(SpiritToken.connect(user).approve(SPIRIT_TOKEN_FACTORY, totalSpiritAmount), `Approve ${totalSpiritAmount} SPIRIT to factory`);

        const userLIM_beforeRedeem = await LiminalToken.balanceOf(user.address);
        await sendTx(SpiritTokenFactory.connect(user).redeemSpirit(totalSpiritAmount), `Reedem ${totalSpiritAmount} SPIRIT from factory`);
        const userLIM_afterRedeem = await LiminalToken.balanceOf(user.address);

        console.log("User LIM balance before redeem:", ethers.formatUnits(userLIM_beforeRedeem, 18));
        console.log("User LIM balance after redeem:", ethers.formatUnits(userLIM_afterRedeem, 18));
        console.log("LIM received from redeem:", ethers.formatUnits(userLIM_afterRedeem - userLIM_beforeRedeem, 18));

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
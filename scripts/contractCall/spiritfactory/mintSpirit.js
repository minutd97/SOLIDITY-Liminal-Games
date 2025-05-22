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

        limFor1 = await SpiritTokenFactory.getRequiredWholeLIMforUSD(1);
        console.log("LIM for $30:", ethers.formatUnits(limFor1, 18));

        await sendTx(LiminalToken.connect(user).approve(SPIRIT_TOKEN_FACTORY, limFor1), `Approve ${limFor1} LIM to factory`);
        await sendTx(SpiritTokenFactory.connect(user).mintSpirit(limFor1), `Mint ${limFor1} SPIRIT to user`);

        console.log("User SPIRIT balance after mint:", ethers.formatUnits(await SpiritToken.balanceOf(user.address), 18));

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
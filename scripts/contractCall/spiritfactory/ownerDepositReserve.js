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
        const owner = new ethers.Wallet(getOwner(), provider);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, owner);
        const SpiritToken = await ethers.getContractAt("SpiritToken", SPIRIT_TOKEN, owner);
        const SpiritTokenFactory = await ethers.getContractAt("SpiritTokenFactory", SPIRIT_TOKEN_FACTORY, owner);

        const depositAmount = ethers.parseUnits("1", 18);
        await sendTx(LiminalToken.connect(owner).approve(SPIRIT_TOKEN_FACTORY, depositAmount), `Approve ${depositAmount} to factory`);
        await sendTx(SpiritTokenFactory.connect(owner).depositToPublicReserve(depositAmount), `Deposit ${depositAmount} to factory to reserve`);

        const publicReserve = await SpiritTokenFactory.publicProtocolReserve();
        console.log("Public reserve after deposit:", ethers.formatUnits(publicReserve, 18));

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
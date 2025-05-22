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

        const ownerLIM_before = await lim.balanceOf(owner.address);
        await sendTx(await SpiritTokenFactory.connect(owner).collectProtocolFees(), `Collect fees from factory`);
        const ownerLIM_after = await lim.balanceOf(owner.address);

        console.log("Owner LIM before fee collect:", ethers.formatUnits(ownerLIM_before, 18));
        console.log("Owner LIM after fee collect:", ethers.formatUnits(ownerLIM_after, 18));
        console.log("LIM received by owner (fees):", ethers.formatUnits(ownerLIM_after - ownerLIM_before, 18));

        // Protocol fees should now be zero
        const protocolFeesZero = await SpiritTokenFactory.collectedProtocolFees();
        console.log("Protocol fees after collection (should be zero):", protocolFeesZero.toString());

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
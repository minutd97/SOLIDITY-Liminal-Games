require("dotenv").config();
const { ethers } = require("hardhat");
const path = require("path");
const {
    getProvider,
    sendTx,
    setTxLogging,
    log_TokenBalance,
    log_EthBalance
} = require(path.resolve(process.cwd(), "scripts/deployUtils"));
const {LIMINAL_PRESALE, POSITION_MANAGER, V4_POOL_HELPER} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const owner = new ethers.Wallet(process.env.TESTNET_PRIVATE_KEY, provider);
        const LiminalPresale = await ethers.getContractAt("LiminalPresale", LIMINAL_PRESALE, owner);

        await sendTx(LiminalPresale.connect(owner).createUniswapV4Pool(), `Creating uniswap v4 pool`);
        await sendTx(LiminalPresale.connect(owner).transferPositionToHelper(POSITION_MANAGER, V4_POOL_HELPER, tokenID), `Transfer V4 position to V4Helper`);

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
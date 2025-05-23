require("dotenv").config();
const { ethers } = require("hardhat");
const path = require("path");
const {
    getOwner,
    getProvider,
    sendTx,
    setTxLogging,
    log_TokenBalance,
    log_EthBalance,
    returnTokenId
} = require(path.resolve(process.cwd(), "scripts/deployUtils"));
const {LIMINAL_PRESALE, POSITION_MANAGER, POSITION_MANAGER_ABI, V4_POOL_HELPER} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const owner = new ethers.Wallet(getOwner(), provider);
        const LiminalPresale = await ethers.getContractAt("LiminalPresale", LIMINAL_PRESALE, owner);
        const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, owner);

        const centerEth = ethers.parseEther("21");
        const rangeSize = 120000;
        
        const receipt = await sendTx(LiminalPresale.connect(owner).createUniswapV4Pool(centerEth, rangeSize), `Creating uniswap v4 pool`);
        const ownerTokenId = await returnTokenId(positionManager, LiminalPresale.target, receipt);
        await sendTx(LiminalPresale.connect(owner).transferPositionToHelper(positionManager, V4_POOL_HELPER, ownerTokenId), `Transfer V4 position to V4Helper, tokenId ${ownerTokenId}`);

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
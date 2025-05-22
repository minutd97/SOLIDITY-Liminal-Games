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
const {
    LIMINAL_TOKEN,
    V4_POOL_HELPER
} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const owner = new ethers.Wallet(getOwner(), provider);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, owner);
        const V4PoolHelper = await ethers.getContractAt("V4PoolHelper", V4_POOL_HELPER, owner);
        
        // WE NEED TO KNOW THE POOL TOKEN ID!!!!
        const ownerTokenId = 0;
        // WE ALSO NEED TO KNOW HOW MUCH TOKENS WE ARE WILLING TO SEND IN LIQUIDITY!
        const [extraETH1, extraLIM1] = await V4PoolHelper.getBestAmountsForUserBalance(ethers.parseEther("10"), ethers.parseEther("1000000"));
        
        console.log(`owner extraETH1 ${ethers.formatEther(extraETH1)}, owner extraLIM1 ${ethers.formatEther(extraLIM1)}`);
        
        await sendTx(LiminalToken.connect(owner).approve(V4_POOL_HELPER, ethers.parseUnits("20000000000", 18)), "Approve tokens to pool helper");
        await sendTx(V4PoolHelper.connect(owner).increaseLiquidityFromContract(ethers.ZeroAddress, LIMINAL_TOKEN, extraETH1, extraLIM1, ownerTokenId, {
            value: extraETH1,
        }), "Increase liquidity from pool helper");

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
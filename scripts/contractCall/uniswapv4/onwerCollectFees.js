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
        // Get balances before
        const ethBefore = await ethers.provider.getBalance(owner.address);
        const limBefore = await LiminalToken.balanceOf(owner.address);
        
        // Call the fee collection
        await sendTx(V4PoolHelper.connect(owner).collectPositionFees(ethers.ZeroAddress, LIMINAL_TOKEN, ownerTokenId), "Collect fees from pool helper");
    
        // Get balances after
        const ethAfter = await ethers.provider.getBalance(owner.address);
        const limAfter = await LiminalToken.balanceOf(owner.address);
    
        // Print deltas
        console.log("ETH collected:", ethers.formatEther(ethAfter - ethBefore));
        console.log("LIM collected:", ethers.formatEther(limAfter - limBefore));

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
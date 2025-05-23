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
const {AIRDROP, LIMINAL_TOKEN} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const user = new ethers.Wallet(process.env.TESTNET_USER_PRIVATE_KEY, provider);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, user);
        const AirdropDistributor = await ethers.getContractAt("AirdropDistributor", AIRDROP, user);

        const limBefore = await LiminalToken.balanceOf(user.address);

        await sendTx(AirdropDistributor.connect(user).claim(), `Claim airdrop for user`);

        const limAfter = await LiminalToken.balanceOf(user.address);
    
        console.log("LIM collected:", ethers.formatEther(limAfter - limBefore));

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
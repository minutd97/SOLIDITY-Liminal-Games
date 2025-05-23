require("@nomicfoundation/hardhat-verify");
require("dotenv").config();
const path = require("path");
const { ethers } = require("hardhat");
const {
    getOwner,
    getProvider,
    log_TokenBalance,
    log_EthBalance
} = require(path.resolve(process.cwd(), "scripts/deployUtils"));
const {LIMINAL_TOKEN} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function main() {
    const provider = getProvider();
    const owner = new ethers.Wallet(getOwner(), provider);
    const user = new ethers.Wallet(process.env.TESTNET_USER_PRIVATE_KEY, provider);
    const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, user);

    const addr = user.address;
    await log_TokenBalance(LiminalToken, "LIM", addr, "This address");
    await log_EthBalance(addr, "This address");

    console.log(`✅ Execution complete`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

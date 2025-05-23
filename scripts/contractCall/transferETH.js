require("@nomicfoundation/hardhat-verify");
require("dotenv").config();
const path = require("path");
const { ethers } = require("hardhat");
const {
    getOwner,
    getProvider
} = require(path.resolve(process.cwd(), "scripts/deployUtils"));

async function main() {
    const provider = getProvider();
    const owner = new ethers.Wallet(getOwner(), provider);
    const user = new ethers.Wallet(process.env.TESTNET_USER_PRIVATE_KEY, provider);

    const TO = user.address;
    const AMOUNT = ethers.parseEther("0.01");       // Replace with amount of ETH to send

    const signer = owner;
    const tx = await signer.sendTransaction({to: TO, value: AMOUNT});

    console.log(`📤 Sending ${ethers.formatEther(AMOUNT)} ETH to ${TO}...`);
    await tx.wait();
    console.log(`✅ ETH transfer complete. Tx hash: ${tx.hash}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
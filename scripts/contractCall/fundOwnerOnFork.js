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

    // Real wallet (will receive ETH)
    // const owner = new ethers.Wallet(getOwner(), provider);
    // const targetAddress = owner.address;

    const user = new ethers.Wallet(process.env.TESTNET_USER_PRIVATE_KEY, provider);
    const targetAddress = user.address;

    // Hardhat default account (pre-funded on fork)
    const funderAddress = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const funder = (await ethers.getSigners())[0];

    const AMOUNT = ethers.parseEther("10"); // Send 10 ETH

    console.log(`🔧 Funding real wallet on forked mainnet...`);
    console.log(`From: ${funderAddress}`);
    console.log(`To  : ${targetAddress}`);
    console.log(`Amount: ${ethers.formatEther(AMOUNT)} ETH`);

    const tx = await funder.sendTransaction({
        to: targetAddress,
        value: AMOUNT
    });

    await tx.wait();
    console.log(`✅ ETH transfer complete. Tx hash: ${tx.hash}`);

    const balance = await provider.getBalance(targetAddress);
    console.log(`💰 New Balance of owner: ${ethers.formatEther(balance)} ETH`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

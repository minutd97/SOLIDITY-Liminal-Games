require("@nomicfoundation/hardhat-verify");
require("dotenv").config();
const { ethers } = require("hardhat");
const {
    getOwner,
    getProvider
} = require(path.resolve(process.cwd(), "scripts/deployUtils"));
const {LIMINAL_TOKEN} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function main() {
    const provider = getProvider();
    const owner = new ethers.Wallet(getOwner(), provider);
    const user = new ethers.Wallet(process.env.TESTNET_USER_PRIVATE_KEY, provider);

    const TO = user.address;
    const AMOUNT = ethers.parseUnits("100", 18);   // Replace "100" and decimals if needed

    const signer = owner;
    const erc20 = await ethers.getContractAt("IERC20", LIMINAL_TOKEN, signer);

    const tx = await erc20.transfer(TO, AMOUNT);
    console.log(`📤 Sending ${AMOUNT} tokens to ${TO}...`);
    await tx.wait();
    console.log(`✅ Token transfer complete. Tx hash: ${tx.hash}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

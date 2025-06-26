const EthCrypto = require("eth-crypto");
const { ethers, solidityPackedKeccak256, toBeHex, getBytes } = require("ethers");
require("dotenv").config();

const RELAYER_PRIVATE_KEY = process.env.HARDHAT_RELAYER_PRIVATE_KEY;
const wallet = new ethers.Wallet(RELAYER_PRIVATE_KEY);

if (!RELAYER_PRIVATE_KEY) {
    throw new Error("❌ PRIVATE_KEY is missing from .env file");
}

console.log("✅ Relayer Address:", wallet.address);

// Function to decrypt a single encrypted string
const decryptWithPrivateKey = async (privateKey, encryptedString) => {
    if (!encryptedString || encryptedString === "") return "0";

    const parts = encryptedString.split(":");
    if (parts.length !== 4) throw new Error("❌ Invalid encrypted data format");

    const [iv, ephemPublicKey, ciphertext, mac] = parts;
    return await EthCrypto.decryptWithPrivateKey(privateKey, { iv, ephemPublicKey, ciphertext, mac });
};

// Function to sign a message
const signMessage = async (message) => {
    return await wallet.signMessage(getBytes(message));
};

// Function to decrypt multiple numbers and sign the result
const decryptNumbers = async (gameId, roundCount, encryptedDataArray) => {
    if (!Array.isArray(encryptedDataArray) || encryptedDataArray.length === 0) {
        throw new Error("❌ Invalid encryptedDataArray format");
    }

    //console.log(`📩 Decrypting for Game ${gameId}, Round ${roundCount}...`);

    // Decrypt all numbers
    const decryptedNumbers = await Promise.all(
        encryptedDataArray.map((encryptedString) => decryptWithPrivateKey(RELAYER_PRIVATE_KEY, encryptedString))
    );

    //console.log(`✅ Decrypted Numbers:`, decryptedNumbers);

    // Convert to integers
    const decryptedNumbersUint = decryptedNumbers.map(n => parseInt(n, 10));

    // Convert numbers to 32-byte hex format
    const hexNumbers = decryptedNumbersUint.map(n => toBeHex(n, 32));

    // Create a Solidity-compatible message hash
    const messageHash = solidityPackedKeccak256(["uint256", "uint256", "uint256[]"], [gameId, roundCount, hexNumbers]);

    // Sign the hash
    const signature = await signMessage(messageHash);

    //console.log("✍️ Signed Message Hash:", messageHash);
    //console.log("✅ Signature:", signature);

    return {
        gameId,
        roundCount,
        decryptedNumbers: decryptedNumbersUint,
        signature
    };
};

// Export the function for use in other scripts
module.exports = { decryptNumbers };

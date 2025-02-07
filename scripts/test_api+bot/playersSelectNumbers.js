const { ethers } = require("hardhat");
const EthCrypto = require("eth-crypto");
require("dotenv").config();

async function main() {
    const [owner, trustedRelayer, user1, user2, user3, user4, user5] = await ethers.getSigners();
    
    // Load contract addresses from .env
    const KAIJI_NO_YUREI = process.env.KAIJI_NO_YUREI;
    const kaijiNoYurei = await ethers.getContractAt("KaijiNoYurei", KAIJI_NO_YUREI);

    // Players select numbers
    console.log("🎲 Players selecting numbers...");
    const numbers = [12, 45, 78, 23, 67]; // Example numbers

    for (let i = 0; i < numbers.length; i++) {
        const player = [user1, user2, user3, user4, user5][i];
        const encryptedNumber = await encryptNumber(numbers[i]);

        const gameID = 1;//await kaijiNoYurei.getPlayerGameId(player.address);
        await kaijiNoYurei.connect(player).selectNumber(gameID, encryptedNumber);
        console.log(`🔐 Player ${i + 1} submitted encrypted number.`);
    }

    console.log("✅ All players submitted numbers!");
}

async function encryptNumber(number) {
    const publicKey = EthCrypto.publicKeyByPrivateKey(
        process.env.HARDHAT_RELAYER_PRIVATE_KEY
    );

    const encrypted = await EthCrypto.encryptWithPublicKey(publicKey, JSON.stringify(number));
    
    return `${encrypted.iv}:${encrypted.ephemPublicKey}:${encrypted.ciphertext}:${encrypted.mac}`;
}

main().catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
});

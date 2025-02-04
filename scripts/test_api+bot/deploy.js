const { ethers } = require("hardhat");

async function main() {
    const [owner, trustedRelayer] = await ethers.getSigners();

    console.log("🚀 Deploying contracts...");

    // Deploy RelayerVerifier
    const RelayerVerifier = await ethers.getContractFactory("RelayerVerifier", owner);
    const relayerVerifier = await RelayerVerifier.deploy(trustedRelayer.address);
    await relayerVerifier.waitForDeployment();
    console.log(`✅ RelayerVerifier deployed at: ${await relayerVerifier.getAddress()}`);

    // Deploy KaijiNoYurei
    const KaijiNoYurei = await ethers.getContractFactory("KaijiNoYurei", owner);
    const kaijiNoYurei = await KaijiNoYurei.deploy(await relayerVerifier.getAddress());
    await kaijiNoYurei.waitForDeployment();
    console.log(`✅ KaijiNoYurei deployed at: ${await kaijiNoYurei.getAddress()}`);

    // Update environment variables
    console.log("📌 Update your .env file with these contract addresses:");
    console.log(`KAIJI_NO_YUREI=${await kaijiNoYurei.getAddress()}`);
    console.log(`KNY_RELAYER_VERIFIER=${await relayerVerifier.getAddress()}`);
}

main().catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
});

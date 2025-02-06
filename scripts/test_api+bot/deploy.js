const { ethers } = require("hardhat");

async function main() {
    const [owner, trustedRelayer] = await ethers.getSigners();

    console.log("🚀 Deploying contracts...");

    // Deploy KNYRelayerVerifier
    const KNYRelayerVerifier = await ethers.getContractFactory("KNYRelayerVerifier", owner);
    const knyRelayerVerifier = await KNYRelayerVerifier.deploy(trustedRelayer.address);
    await knyRelayerVerifier.waitForDeployment();
    console.log(`✅ KNYRelayerVerifier deployed at: ${await knyRelayerVerifier.getAddress()}`);

    // Deploy KaijiNoYurei
    const KaijiNoYurei = await ethers.getContractFactory("KaijiNoYurei", owner);
    const kaijiNoYurei = await KaijiNoYurei.deploy(await knyRelayerVerifier.getAddress());
    await kaijiNoYurei.waitForDeployment();
    console.log(`✅ KaijiNoYurei deployed at: ${await kaijiNoYurei.getAddress()}`);

    // Update environment variables
    console.log("📌 Update your .env file with these contract addresses:");
    console.log(`KAIJI_NO_YUREI=${await kaijiNoYurei.getAddress()}`);
    console.log(`KNY_RELAYER_VERIFIER=${await knyRelayerVerifier.getAddress()}`);
}

main().catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
});

async function deploy() {
    try {
        const [owner, trustedRelayer] = await ethers.getSigners();

        console.log("🚀 Deploying contracts...");

        // Deploy KNYRelayerVerifier
        const KNYRelayerVerifier = await ethers.getContractFactory("KNYRelayerVerifier", owner);
        const knyRelayerVerifier = await KNYRelayerVerifier.deploy(trustedRelayer.address);
        await knyRelayerVerifier.waitForDeployment();
        console.log(`✅ KNYRelayerVerifier deployed at: ${await knyRelayerVerifier.getAddress()}`);

        // Deploy KNYBet
        // const KNYBet = await ethers.getContractFactory("KNYBet", owner);
        // const knyBet = await KNYBet.deploy();
        // await knyBet.waitForDeployment();
        // console.log(`✅ KNYBet deployed at: ${await knyBet.getAddress()}`);

        // Deploy KaijiNoYurei
        const KaijiNoYurei = await ethers.getContractFactory("KaijiNoYurei", owner);
        const kaijiNoYurei = await KaijiNoYurei.deploy(await knyRelayerVerifier.getAddress(), await knyBet.getAddress());
        await kaijiNoYurei.waitForDeployment();
        console.log(`✅ KaijiNoYurei deployed at: ${await kaijiNoYurei.getAddress()}`);

        // Grant access to KaijiNoYurei contract
        // await knyBet.grantManageRole(await kaijiNoYurei.getAddress());
        // console.log(`✅ Granted access to KaijiNoYurei contract`);

        process.exit(0); // Ensure clean exit
    } catch (error) {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    }
}

deploy();

const { ethers, run } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(`🚀 Deploying contract with account: ${deployer.address}`);

    // ✅ Deploy the contract
    const LiminalDecryptNumbers = await ethers.getContractFactory("LiminalDecryptNumbers");
    const contract = await LiminalDecryptNumbers.deploy();
    await contract.waitForDeployment();

    const contractAddress = await contract.getAddress();
    console.log(`✅ LiminalDecryptNumbers deployed at: ${contractAddress}`);

    // ✅ Verify the contract on Arbiscan
    console.log("🔍 Verifying contract on Arbiscan...");
    await run("verify:verify", {
        address: contractAddress,
        constructorArguments: [], // Replace with actual constructor arguments
    });

    console.log("✅ Contract verified!");
}

main().catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exitCode = 1;
});

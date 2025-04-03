const { ethers, run } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(`🚀 Deploying contract with account: ${deployer.address}`);

    // ✅ Deploy the MockToken contract
    const MockToken = await ethers.getContractFactory("MockToken");
    const mock = await MockToken.deploy();
    await mock.waitForDeployment();

    const contractAddress = await mock.getAddress();
    console.log(`✅ MockToken deployed at: ${contractAddress}`);

    // ✅ Verify the contract on Arbiscan
    console.log("🔍 Verifying contract on Arbiscan...");
    await run("verify:verify", {
        address: contractAddress,
        constructorArguments: [],
        contract: "contracts/MockToken.sol:MockToken", // 👈 precise contract path and name
      });      

    console.log("✅ Contract verified!");
}

main().catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exitCode = 1;
});

require("@nomicfoundation/hardhat-verify");
require("dotenv").config();
const { ethers } = require("hardhat");
const path = require("path");
const { getProvider } = require(path.resolve(process.cwd(), "scripts/deployProvider"));

const POSITION_MANAGER = "0xAc631556d3d4019C95769033B5E719dD77124BAc";
const LIMINAL_TOKEN = "0xD19Ed21D2AdCf76C8074716e484740a2197d9506";
const LIMINAL_TOKEN_DISTRIBUTOR = "0x257f48ED50E6DF84434EEAf23128F51fFd7c1146";

async function deploy() {
    try {
        const provider = getProvider();
        const owner = new ethers.Wallet(process.env.TESTNET_PRIVATE_KEY, provider);
        const LiminalDistributor = await ethers.getContractAt("LiminalDistributor", LIMINAL_TOKEN_DISTRIBUTOR, owner);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, owner);

        console.log("\n🚀 Deploying contracts...");
        console.log(`Contracts Owner : ${owner.address}`);

        // Deploy LPStakingRewards
        const lpStakingRewards = await deployContract("LPStakingRewards", owner, [LIMINAL_TOKEN, POSITION_MANAGER]);

        // Grant Liminal Distributor as the pool loader
        await sendTx(lpStakingRewards.connect(owner).grantLoaderRole(LIMINAL_TOKEN_DISTRIBUTOR), `Grant Liminal Distributor as the pool loader`);

        // Register the GameTreasury contract in the distributor
        await sendTx(LiminalDistributor.connect(owner).setLPStaking(lpStakingRewards.target), `Setting LPStakingRewards address in distributor`);

        await log_TokenBalance(LiminalToken, "LIM", LIMINAL_TOKEN_DISTRIBUTOR, "Distributor");
        // Then trigger the token distribution
        await sendTx(LiminalDistributor.connect(owner).distributeToLPStaking(), `Distributing tokens to LPStakingRewards`);

        await log_TokenBalance(LiminalToken, "LIM", LIMINAL_TOKEN_DISTRIBUTOR, "Distributor");
    
        console.log("✅ LPStakingRewards Deployment Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ LPStakingRewards Deployment failed:", error);
        process.exit(1);
    }
}

async function deployContract(name, signer, args = []) {
  const Factory = await ethers.getContractFactory(name, signer);
  const contract = await Factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`✅ ${name} deployed at:`, address);
  return contract;
}

async function sendTx(txPromise, label = "tx") {
  const tx = await txPromise;
  //console.log(`⏳ Waiting for ${label}...`);
  await tx.wait();
  //console.log(`✅ ${label} confirmed:`, tx.hash);
  return tx;
}

async function verifyContract(address, constructorArgs = [], contractPath = undefined) {
    console.log(`🔍 Verifying contract at ${address}...`);

    try {
        await hre.run("verify:verify", {
            address,
            constructorArguments: constructorArgs,
            contract: contractPath, // Optional: e.g., "contracts/MyToken.sol:MyToken" if you're using custom subfolder structures
        });
        console.log("✅ Verified on Arbiscan");
    } catch (err) {
        const msg = err.message || "";
        if (
            msg.includes("Already Verified") ||
            msg.includes("Contract source code already verified")
        ) {
            console.log("ℹ️ Contract already verified");
        } else {
            console.error("❌ Verification failed:", msg);
        }
    }
}

async function log_TokenBalance(token, tokenName, userAddr, userName){
    let tokenBalance = await token.balanceOf(userAddr);
    console.log(`${userName} ${tokenName} BALANCE: ${ethers.formatEther(tokenBalance)}`);
}

deploy();

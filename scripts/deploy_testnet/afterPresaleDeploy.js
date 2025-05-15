require("dotenv").config();
const { ethers } = require("hardhat");

const LIMINAL_TOKEN = "0xD19Ed21D2AdCf76C8074716e484740a2197d9506";
const LIMINAL_TOKEN_DISTRIBUTOR = "0x257f48ED50E6DF84434EEAf23128F51fFd7c1146";

async function deploy() {
    try {
        const provider = new ethers.JsonRpcProvider(process.env.REAL_DEPLOY ? process.env.ARBITRUM_TESTNET_PROV : "http://127.0.0.1:8545");
        const owner = new ethers.Wallet(process.env.TESTNET_PRIVATE_KEY, provider);
        const LiminalDistributor = await ethers.getContractAt("LiminalDistributor", LIMINAL_TOKEN_DISTRIBUTOR, owner);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, owner);

        console.log("\n🚀 Deploying contracts...");
        console.log(`Contracts Owner : ${owner.address}`);

        // Deploy KNYRelayerVerifier
        const knyRelayerVerifier = await deployContract("KNYRelayerVerifier", owner, [owner.address]); // we need a trusted relayer wallet not the owner here

        // Deploy KaijiNoYurei
        const kaijiNoYurei = await deployContract("KaijiNoYurei", owner, [knyRelayerVerifier.target]);

        // Deploy SpiritToken
        const spiritToken = await deployContract("SpiritToken", owner);

        // Deploy SpiritTokenFactory
        const pegRate =  ethers.parseUnits("0.00004", "ether"); // pegRate = 0.00004 ETH
        const redeemFee = 100; // redeemFee = 1%
        const spiritTokenFactory = await deployContract("SpiritTokenFactory", owner, [spiritToken.target, pegRate, redeemFee]);

        // Deploy GameTreasury
        const upfrontUnlocked = ethers.parseEther("5000000"); //5M LIM
        const totalAllocation = ethers.parseEther("75000000"); // 75M LIM
        const vestingDuration = 6 * 30 * 24 * 60 * 60;       // 6 months
        const gameTreasury = await deployContract("GameTreasury", owner, [LIMINAL_TOKEN, totalAllocation, upfrontUnlocked, vestingDuration]);

        // Grant Liminal Distributor as the pool loader
        await sendTx(gameTreasury.connect(owner).grantLoaderRole(LIMINAL_TOKEN_DISTRIBUTOR), `Grant Liminal Distributor as the pool loader`);

        // Register the GameTreasury contract in the distributor
        await sendTx(LiminalDistributor.connect(owner).setGameTreasury(gameTreasury.target), `Setting GameTreasury address in distributor`);

        await log_TokenBalance(LiminalToken, "LIM", LIMINAL_TOKEN_DISTRIBUTOR, "Distributor");
        // Then trigger the token distribution
        await sendTx(LiminalDistributor.connect(owner).distributeToGameTreasury(), `Distributing tokens to GameTreasury`);

        await log_TokenBalance(LiminalToken, "LIM", LIMINAL_TOKEN_DISTRIBUTOR, "Distributor");
    
        console.log("✅ After Presale Deployment Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ After Presale Deployment failed:", error);
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

async function log_TokenBalance(token, tokenName, userAddr, userName){
    let tokenBalance = await token.balanceOf(userAddr);
    console.log(`${userName} ${tokenName} BALANCE: ${ethers.formatEther(tokenBalance)}`);
}

deploy();

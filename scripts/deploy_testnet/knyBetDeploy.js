require("dotenv").config();
const { ethers } = require("hardhat");

const LIMINAL_TOKEN = "0xD19Ed21D2AdCf76C8074716e484740a2197d9506";

async function deploy() {
    try {
        const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545"); //process.env.ARBITRUM_TESTNET_PROV
        const owner = new ethers.Wallet(process.env.TESTNET_PRIVATE_KEY, provider);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, owner);

        console.log("\n🚀 Deploying contracts...");
        console.log(`Contracts Owner : ${owner.address}`);

        // Deploy KNYBet
        const knyBet = await deployContract("KNYBet", owner);
    
        console.log("✅ KNYBet Deployment Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ KNYBet Deployment failed:", error);
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

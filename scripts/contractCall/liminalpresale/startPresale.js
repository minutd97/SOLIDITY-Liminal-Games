require("dotenv").config();
const { ethers } = require("hardhat");
const path = require("path");
const { getProvider } = require(path.resolve(process.cwd(), "scripts/deployProvider"));

const LIMINAL_PRESALE = "0x87B557e69173899F4A2948EA45a51FD0e54818C4";

async function execute() {
    try {
        const provider = getProvider();
        const owner = new ethers.Wallet(process.env.TESTNET_PRIVATE_KEY, provider);
        const LiminalPresale = await ethers.getContractAt("LiminalPresale", LIMINAL_PRESALE, owner);

        console.log("\n🚀 Starting presale...");

        const presaleDuration = 30 * 60; // 30 minutes
        await sendTx(LiminalPresale.connect(owner).startPresale(presaleDuration), `Starting presale with ${presaleDuration} duration`);

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
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
  console.log(`⏳ Waiting for ${label}...`);
  await tx.wait();
  console.log(`✅ ${label} confirmed:`, tx.hash);
  return tx;
}

async function log_TokenBalance(token, tokenName, userAddr, userName){
    let tokenBalance = await token.balanceOf(userAddr);
    console.log(`${userName} ${tokenName} BALANCE: ${ethers.formatEther(tokenBalance)}`);
}

execute();
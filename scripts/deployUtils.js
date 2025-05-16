require("@nomicfoundation/hardhat-verify");
require("dotenv").config();
const { ethers } = require("hardhat");

let txLogging = true;
function setTxLogging (canLog) {
    txLogging = canLog;
}

function isLocalNetwork() {
    return hre.network.name === "hardhat" || hre.network.name === "localhost";
}

function getProvider() {
    return isLocalNetwork()
        ? new ethers.JsonRpcProvider("http://127.0.0.1:8545")
        : ethers.provider; // Already correctly set by Hardhat
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

  if(txLogging)
    console.log(`⏳ Waiting for ${label}...`);

  await tx.wait();

  if(txLogging)
    console.log(`✅ ${label} confirmed:`, tx.hash);

  return tx;
}

async function verifyContract(address, constructorArgs = [], contractPath = undefined) {
    if(isLocalNetwork())
    {
        console.log(`❌ Can't verify contract at ${address} on a local hardhat chain!`);
        return;
    }
    
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

async function log_EthBalance(address, name) {
    let ethBalance = await ethers.provider.getBalance(address);
    console.log(`${name} ETH BALANCE: ${ethers.formatEther(ethBalance)}`);
}

module.exports = {
    getProvider,
    deployContract,
    sendTx,
    setTxLogging,
    verifyContract,
    log_TokenBalance,
    log_EthBalance
};
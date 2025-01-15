const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Liminal Test Contracts: KaijiNoYurei", function () {
  
  let tokenLIM, linimalTreasury, kaijiNoYurei; // kaijiNoYurei = Game contract

  async function deployContractsFixture() {
    const [owner, user1, user2, user3, user4] = await ethers.getSigners();
    
    tokenLIM = await deployContract("LiminalToken");
    linimalTreasury = await deployContract("LiminalTreasury");
    kaijiNoYurei = await deployContract("KaijiNoYurei");

    return { owner, user1, user2, user3, user4 };
  }

  describe("Running test", function () {
    it("Test succeded!", async function () {
      
      this.timeout(0); 
      const { owner, user1, user2, user3, user4 } = await loadFixture(deployContractsFixture);

    });
  });

  async function deployContract(contractName) {
      const ContractFactory = await ethers.getContractFactory(contractName);
      const deployedContract = await ContractFactory.deploy();
      await deployedContract.waitForDeployment();
      console.log(contractName, "deployed to:", deployedContract.target);
      return deployedContract; // Return the deployed contract
  }

  async function log_EthBalance(address, name) {
    let ethBalance = await ethers.provider.getBalance(address);
    console.log(`${name} ETH BALANCE: ${ethers.formatEther(ethBalance)}`);
  }

  async function log_TokenBalance(token, tokenName, userAddr, userName){
      let tokenBalance = await token.balanceOf(userAddr);
      console.log(`${userName} ${tokenName} BALANCE: ${ethers.formatEther(tokenBalance)}`);
  }

  async function increaseTime(seconds) {
      // Increase the time
      await ethers.provider.send("evm_increaseTime", [seconds]);
      // Mine a new block to apply the new timestamp
      await ethers.provider.send("evm_mine");
      // Log the current block timestamp for debugging
      const block = await ethers.provider.getBlock("latest");
      console.log(`New block timestamp: ${block.timestamp}`);
  }

  async function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
  }
});
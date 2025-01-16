const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Liminal Test Contracts: KaijiNoYurei", function () {
  
  let tokenLIM, linimalTreasury, kaijiNoYurei; // kaijiNoYurei = Game contract

  async function deployContractsFixture() {
    const [owner, user1, user2, user3, user4, user5, user6] = await ethers.getSigners();
    
    tokenLIM = await deployContract("LiminalToken");
    linimalTreasury = await deployContract("LiminalTreasury");
    kaijiNoYurei = await deployContract("KaijiNoYurei");

    return { owner, user1, user2, user3, user4, user5, user6 };
  }

  describe("Running test", function () {
    it("Test succeded!", async function () {
      
      this.timeout(0); 
      const { owner, user1, user2, user3, user4, user5, user6 } = await loadFixture(deployContractsFixture);

      const addresses = [owner.address, user1.address, user2.address, user3.address, user4.address, user5.address, user6.address];
      const names = ["owner", "user1", "user2", "user3", "user4", "user5", "user6"];

      logUserAddresses(addresses, names);

      await kaijiNoYurei.connect(user1).joinGame();
      await kaijiNoYurei.connect(user2).joinGame();
      await kaijiNoYurei.connect(user3).joinGame();
      await kaijiNoYurei.connect(user4).joinGame();
      await kaijiNoYurei.connect(user5).joinGame();

      // Player already joined
      await expect(kaijiNoYurei.connect(user5).joinGame()).to.be.reverted;

      // Game is full
      await expect(kaijiNoYurei.connect(user6).joinGame()).to.be.reverted;

      await kaijiNoYurei.connect(owner).startGame();

      // Game already started
      await expect(kaijiNoYurei.connect(user6).joinGame()).to.be.reverted;

      await kaijiNoYurei.connect(owner).startRound();

      await kaijiNoYurei.connect(user1).selectNumber(25);
      await kaijiNoYurei.connect(user2).selectNumber(25);
      await kaijiNoYurei.connect(user3).selectNumber(25);
      await kaijiNoYurei.connect(user4).selectNumber(25);
      await kaijiNoYurei.connect(user5).selectNumber(26);

      await increaseTime(180);

      await kaijiNoYurei.connect(owner).endRound();

    });
  });

  async function deployContract(contractName) {
      const ContractFactory = await ethers.getContractFactory(contractName);
      const deployedContract = await ContractFactory.deploy();
      await deployedContract.waitForDeployment();
      console.log(contractName, "deployed to:", deployedContract.target);
      return deployedContract; // Return the deployed contract
  }

  function logUserAddresses(addresses, names) {
      if (addresses.length !== names.length) {
          console.error("Error: Addresses and names arrays must have the same length.");
          return;
      }

      for (let i = 0; i < addresses.length; ++i) {
          console.log(`${names[i]}: ${addresses[i]}`);
      }
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
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const EthCrypto = require("eth-crypto");
const { Wallet } = require('ethers');
const { publicKey } = require("eth-crypto");
const { Point } = require("@noble/secp256k1");

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

      // await kaijiNoYurei.connect(user1).joinGame();
      // await kaijiNoYurei.connect(user2).joinGame();
      // await kaijiNoYurei.connect(user3).joinGame();
      // await kaijiNoYurei.connect(user4).joinGame();
      // await kaijiNoYurei.connect(user5).joinGame();

      // // Player already joined
      // await expect(kaijiNoYurei.connect(user5).joinGame()).to.be.reverted;

      // // Game is full
      // await expect(kaijiNoYurei.connect(user6).joinGame()).to.be.reverted;

      // await kaijiNoYurei.connect(owner).startGame();

      // // Game already started
      // await expect(kaijiNoYurei.connect(user6).joinGame()).to.be.reverted;

      // await kaijiNoYurei.connect(owner).startRound();

      // await kaijiNoYurei.connect(user1).selectNumber(25);
      // await kaijiNoYurei.connect(user2).selectNumber(25);
      // await kaijiNoYurei.connect(user3).selectNumber(25);
      // await kaijiNoYurei.connect(user4).selectNumber(25);
      // await kaijiNoYurei.connect(user5).selectNumber(26);

      // await increaseTime(180);

      // await kaijiNoYurei.connect(owner).endRound();

      var users = [user1, user2, user3, user4, user5];

      await encryptNumberAndSend(user1, 68, owner.address);

      //await simulateSelection([1, 1, 1, 68, 100], users, owner);

      // // Scenario 1: Base Rule
      // console.log("_____Base Rule");
      // await simulateSelection([30, 40, 50, 60, 70], users, owner);

      // // Scenario 2: Closest Tie Penalty (Rule 5)
      // console.log("_____Closest Tie Penalty");
      // await simulateSelection([34, 50, 50, 60, 70], users, owner);

      // // Scenario 3: Time’s Up Penalty + Basic rule
      // console.log("_____Time’s Up Penalty  + Basic rule");
      // await simulateSelection([34, -1, 50, -1, 70], users, owner);

      // // Scenario 4: Majority Timeout Rule
      // console.log("_____Majority Timeout Rule");
      // await simulateSelection([34, -1, -1, -1, 70], users, owner);

      // // Scenario 5: Closest Tie Penalty + Time’s Up Penalty
      // console.log("_____Closest Tie Penalty + Time’s Up Penalty");
      // await simulateSelection([25, 25, -1, -1, 26], users, owner);

      // await simulateSelection([25, 20, -1, -1, 26], users, owner);

      // await simulateSelection([25, 20, -1, -1, 26], users, owner);

      // // Scenario 6: Exact Match Bonus + Time’s Up Penalty
      // console.log("_____Exact Match Bonus + Time’s Up Penalty");
      // await simulateSelection([33, -1, -1, -1, 22], users, owner);

      // await simulateSelection([33, 22, -1, -1, 22], users, owner);

      // await simulateSelection([33, 22, -1, -1, 22], users, owner);

      // // Scenario 7: Extreme Bluff Rule
      // await simulateSelection([0, -1, -1, -1, 100], users, owner);

    });
  });

  async function simulateSelection(userNumbers, users, owner){

    await kaijiNoYurei.connect(owner).startRound();

    if(userNumbers[0] != -1)
      await kaijiNoYurei.connect(users[0]).selectNumber(userNumbers[0]);
    
    if(userNumbers[1] != -1)
      await kaijiNoYurei.connect(users[1]).selectNumber(userNumbers[1]);
    
    if(userNumbers[2] != -1)
      await kaijiNoYurei.connect(users[2]).selectNumber(userNumbers[2]);
    
    if(userNumbers[3] != -1)
      await kaijiNoYurei.connect(users[3]).selectNumber(userNumbers[3]);
    
    if(userNumbers[4] != -1)
      await kaijiNoYurei.connect(users[4]).selectNumber(userNumbers[4]);

    await increaseTime(180);

    await kaijiNoYurei.connect(owner).processRound();

  }

  async function encryptNumberAndSend(user, number, ownerAddr) {
    
      const publicKey = EthCrypto.publicKeyByPrivateKey(
          '0x59c6995e998f97a5a0044966f09453890ac986d28b93a39c2051ff1e6b8c32d3'
      );

      // Encrypt the number using the uncompressed public key
      const encrypted = await EthCrypto.encryptWithPublicKey(
          publicKey,
          JSON.stringify(number)
      );
  
      // Convert encrypted object to string
      //const encryptedString = EthCrypto.cipher.stringify(encrypted);
      console.log("Encrypted String:", encrypted.iv, encrypted.ephemPublicKey, encrypted.ciphertext, encrypted.mac);
  
      //return encryptedString;
    // Submit the encrypted string to the contract
    //await kaijiNoYurei.connect(user).selectNumber(encryptedString);
  }

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
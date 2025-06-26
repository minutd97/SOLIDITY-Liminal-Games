const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const EthCrypto = require("eth-crypto");
const { decryptNumbers } = require("./decryptionModule");
require("dotenv").config();

describe("Liminal Test Contracts: KaijiNoYurei", function () {
  
  let kaijiNoYurei, knyRelayerVerifier;
  let roundID = 0;

  async function deployContractsFixture() {
    const [owner, trustedRelayer, user1, user2, user3, user4, user5, user6] = await ethers.getSigners();
    
    knyRelayerVerifier = await deployContract("KNYRelayerVerifier", owner, [trustedRelayer.address]);
    kaijiNoYurei = await deployContract("KaijiNoYurei", owner, [knyRelayerVerifier.getAddress()]);
    return { owner, trustedRelayer, user1, user2, user3, user4, user5, user6 };
  }

  describe("Running test", function () {
    it("Test succeded!", async function () {
      
      this.timeout(0); 
      const { owner, trustedRelayer, user1, user2, user3, user4, user5, user6 } = await loadFixture(deployContractsFixture);

      const addresses = [owner.address, trustedRelayer.address, user1.address, user2.address, user3.address, user4.address, user5.address, user6.address];
      const names = ["owner", "trustedRelayer", "user1", "user2", "user3", "user4", "user5", "user6"];

      logUserAddresses(addresses, names);

      await kaijiNoYurei.connect(user1).joinGame();
      await kaijiNoYurei.connect(user2).joinGame();
      await kaijiNoYurei.connect(user3).joinGame();
      await kaijiNoYurei.connect(user4).joinGame();
      await kaijiNoYurei.connect(user5).joinGame();

      // // Player already joined
      // await expect(kaijiNoYurei.connect(user5).joinGame()).to.be.reverted;

      // // Game is full
      // await expect(kaijiNoYurei.connect(user6).joinGame()).to.be.reverted;

      let currentGameID = 1;

      await kaijiNoYurei.connect(owner).startGame(currentGameID);
      await kaijiNoYurei.connect(owner).startRound(currentGameID);

      // // Game already started
      // await expect(kaijiNoYurei.connect(user6).joinGame()).to.be.reverted;

      var users = [user1, user2, user3, user4, user5];

      //await simulateSelection([-1, 0, 0, 0, 0], users, owner, trustedRelayer);

      // Scenario 1: Base Rule
      console.log("_____Base Rule");
      await simulateSelection(currentGameID, [30, 40, 50, 60, 70], users, owner, trustedRelayer);

      // Scenario 2: Closest Tie Penalty (Rule 5)
      console.log("_____Closest Tie Penalty");
      await simulateSelection(currentGameID, [34, 50, 50, 60, 70], users, owner, trustedRelayer);

      // Scenario 3: Time’s Up Penalty + Basic rule
      console.log("_____Time’s Up Penalty + Basic rule");
      await simulateSelection(currentGameID, [34, -1, 50, -1, 70], users, owner, trustedRelayer);

      // Scenario 4: Majority Timeout Rule
      console.log("_____Majority Timeout Rule");
      await simulateSelection(currentGameID, [34, -1, -1, -1, 70], users, owner, trustedRelayer);

      // Scenario 5: Closest Tie Penalty + Time’s Up Penalty
      console.log("_____Closest Tie Penalty + Time’s Up Penalty");
      await simulateSelection(currentGameID, [25, 25, -1, -1, 26], users, owner, trustedRelayer);

      await simulateSelection(currentGameID, [25, 20, -1, -1, 26], users, owner, trustedRelayer);

      await simulateSelection(currentGameID, [25, 20, -1, -1, 26], users, owner,trustedRelayer);

      // Scenario 6: Exact Match Bonus + Time’s Up Penalty
      console.log("_____Exact Match Bonus + Time’s Up Penalty");
      await simulateSelection(currentGameID, [33, -1, -1, -1, 22], users, owner, trustedRelayer);

      await simulateSelection(currentGameID, [33, 22, -1, -1, 22], users, owner, trustedRelayer);

      await simulateSelection(currentGameID, [33, 22, -1, -1, 22], users, owner, trustedRelayer);

      // Scenario 7: Extreme Bluff Rule
      await simulateSelection(currentGameID, [0, -1, -1, -1, 100], users, owner, trustedRelayer);

      await simulateSelection(currentGameID, [0, -1, -1, -1, 100], users, owner, trustedRelayer);

      await simulateSelection(currentGameID, [0, -1, -1, -1, 100], users, owner, trustedRelayer);

      await simulateSelection(currentGameID, [0, -1, -1, -1, 100], users, owner, trustedRelayer);
    });
  });

  async function simulateSelection(gameId, userNumbers, users, owner, trustedRelayer) {
    roundID++;
    let encryptedNumbers = [];

    for (let i = 0; i < userNumbers.length; i++) {
      if (userNumbers[i] === -1) {
        encryptedNumbers.push("");
      } else {
        const enc = await encryptNumber(userNumbers[i]);
        encryptedNumbers.push(enc);
        await kaijiNoYurei.connect(users[i]).selectNumber(gameId, enc);
      }
    }

    await time.increase(180);
    await ethers.provider.send("evm_mine");

    const { decryptedNumbers, signature } = await decryptNumbers(gameId, roundID, encryptedNumbers);

    await submitDecryptedNumbers(trustedRelayer, gameId, roundID, decryptedNumbers, signature);
    await kaijiNoYurei.connect(owner).processRound(gameId);
  }

  async function encryptNumber(number) {
    const publicKey = EthCrypto.publicKeyByPrivateKey(process.env.HARDHAT_RELAYER_PRIVATE_KEY);
    const encrypted = await EthCrypto.encryptWithPublicKey(publicKey, JSON.stringify(number));
    return `${encrypted.iv}:${encrypted.ephemPublicKey}:${encrypted.ciphertext}:${encrypted.mac}`;
  }

  async function fetchEncryptedNumbers(gameId) {
      try {
          const encryptedNumbers = await kaijiNoYurei.getEncryptedNumbers(gameId);
          //console.log("📩 Encrypted Numbers:", encryptedNumbers);
          return encryptedNumbers;
      } catch (error) {
          console.error("❌ Failed to fetch encrypted numbers:", error.message);
          throw error;
      }
  }

  async function submitDecryptedNumbers(signer, gameId, roundId, decryptedNumbers, signature) {
      try {
          const tx = await knyRelayerVerifier.connect(signer).submitDecryptedNumbers(gameId, roundId, decryptedNumbers, signature);
          await tx.wait();
          console.log("✅ Decryption submitted successfully for round", roundId, "Tx Hash:", tx.hash);
      } catch (error) {
          console.error("❌ Contract submission failed:", error.message);
      }
  }

  async function deployContract(contractName, owner, args = []) {
      const ContractFactory = await ethers.getContractFactory(contractName, owner);
      const deployedContract = await ContractFactory.deploy(...args);
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
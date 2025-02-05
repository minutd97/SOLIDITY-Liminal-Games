const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const EthCrypto = require("eth-crypto");
const axios = require("axios");
require("dotenv").config();

const RELAYER_API_URL = "http://localhost:3000/decrypt"; // Adjust if deployed remotely

describe("Liminal Test Contracts: KaijiNoYurei", function () {
  
  let tokenLIM, linimalTreasury, kaijiNoYurei, relayerVerifier; // kaijiNoYurei = Game contract
  let roundID = 0;

  async function deployContractsFixture() {
    const [owner, trustedRelayer, user1, user2, user3, user4, user5, user6] = await ethers.getSigners();
    
    tokenLIM = await deployContract("LiminalToken", owner, []);
    linimalTreasury = await deployContract("LiminalTreasury", owner, []);
    relayerVerifier = await deployContract("RelayerVerifier", owner, [trustedRelayer.address]);
    kaijiNoYurei = await deployContract("KaijiNoYurei", owner, [relayerVerifier.getAddress()]);
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

  async function simulateSelection(currentGameID, userNumbers, users, owner, trustedRelayer){

    roundID++;

    var encryptedNumbers = [];

    encryptedNumbers.push(await returnEncryptedNumber(userNumbers[0]));
    encryptedNumbers.push(await returnEncryptedNumber(userNumbers[1]));
    encryptedNumbers.push(await returnEncryptedNumber(userNumbers[2]));
    encryptedNumbers.push(await returnEncryptedNumber(userNumbers[3]));
    encryptedNumbers.push(await returnEncryptedNumber(userNumbers[4]));

    if(userNumbers[0] != -1)
      await kaijiNoYurei.connect(users[0]).selectNumber(currentGameID, encryptedNumbers[0]);
    
    if(userNumbers[1] != -1)
      await kaijiNoYurei.connect(users[1]).selectNumber(currentGameID, encryptedNumbers[1]);
    
    if(userNumbers[2] != -1)
      await kaijiNoYurei.connect(users[2]).selectNumber(currentGameID, encryptedNumbers[2]);
    
    if(userNumbers[3] != -1)
      await kaijiNoYurei.connect(users[3]).selectNumber(currentGameID, encryptedNumbers[3]);
    
    if(userNumbers[4] != -1)
      await kaijiNoYurei.connect(users[4]).selectNumber(currentGameID, encryptedNumbers[4]);

    await increaseTime(180);

    encryptedNumbers = await fetchEncryptedNumbers(currentGameID);
    const {gameId, roundId, decryptedNumbers, signature } = await requestDecryption(currentGameID, roundID, encryptedNumbers);  
    await submitToRelayerContract(trustedRelayer, gameId, roundId, decryptedNumbers, signature);

    await kaijiNoYurei.connect(owner).processRound(currentGameID);
  }

  async function returnEncryptedNumber(number) {

      const publicKey = EthCrypto.publicKeyByPrivateKey(
          process.env.HARDHAT_RELAYER_PRIVATE_KEY
      );

      // Encrypt the number using the uncompressed public key
      const encrypted = await EthCrypto.encryptWithPublicKey(
          publicKey,
          JSON.stringify(number)
      );
  
      // Convert encrypted object to string
      const encryptedStringified =
        encrypted.iv + ":" +
        encrypted.ephemPublicKey + ":" +
        encrypted.ciphertext + ":" +
        encrypted.mac;

      //console.log("Encrypted :", encrypted.iv, encrypted.ephemPublicKey, encrypted.ciphertext, encrypted.mac);
      //console.log("Encrypted stringified for number ", number,": ", encryptedStringified);
      return encryptedStringified;
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

  async function requestDecryption(gameId, roundId, encryptedNumbers) {
      try {
          const response = await axios.post(RELAYER_API_URL, {
              gameId,
              roundId,
              encryptedDataArray: encryptedNumbers
          });

          console.log("📩 API Response:", response.data);

          return {
              gameId: response.data.gameId,
              roundId: response.data.roundId,
              decryptedNumbers: response.data.decryptedNumbers,
              signature: response.data.signature
          };
      } catch (error) {
          console.error("❌ API Request Failed:", error.message);
          throw error;
      }
  }
 
  async function submitToRelayerContract(signer, gameId, roundId, decryptedNumbers, signature) {
      try {
          const tx = await relayerVerifier.connect(signer).submitDecryptedNumbers(gameId, roundId, decryptedNumbers, signature);
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
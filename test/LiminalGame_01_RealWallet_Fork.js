const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const EthCrypto = require("eth-crypto");
const { execSync } = require("child_process");
require("dotenv").config();

describe("Liminal Test Contracts: KaijiNoYurei", function () {
  
  let tokenLIM, linimalTreasury, kaijiNoYurei, liminalDecryptNumbers; // kaijiNoYurei = Game contract
  let realOwnerWallet;

  async function deployContractsFixture() {
    const [owner, user1, user2, user3, user4, user5, user6] = await ethers.getSigners();
    
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545"); // ✅ Local Hardhat Fork
    realOwnerWallet = new ethers.Wallet(process.env.TESTNET_PRIVATE_KEY, provider);
    
    tokenLIM = await deployContract("LiminalToken", realOwnerWallet);
    linimalTreasury = await deployContract("LiminalTreasury", realOwnerWallet);
    kaijiNoYurei = await deployContract("KaijiNoYurei", realOwnerWallet);
    liminalDecryptNumbers = await ethers.getContractAt(
        "LiminalDecryptNumbers",
        "0x991a5e58661cef902a57bb0f1ab5c08338cb8bba"
    );
    return { owner, user1, user2, user3, user4, user5, user6 };
  }

  describe("Running test", function () {
    it("Test succeded!", async function () {
      
      this.timeout(0); 
      const { owner, user1, user2, user3, user4, user5, user6 } = await loadFixture(deployContractsFixture);

      const addresses = [realOwnerWallet.address, user1.address, user2.address, user3.address, user4.address, user5.address, user6.address];
      const names = ["owner", "user1", "user2", "user3", "user4", "user5", "user6"];

      logUserAddresses(addresses, names);

      //console.log("DELAY BEGINS!");
      //await delay(120000);

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

      var encryptedNumbers = [];

      encryptedNumbers.push(await encryptNumberAndSend(user1, 23, realOwnerWallet.address)); //68
      encryptedNumbers.push(await encryptNumberAndSend(user2, 38, realOwnerWallet.address)); //12
      //encryptedNumbers.push(await encryptNumberAndSend(user3, 38, realOwnerWallet.address));
      //encryptedNumbers.push(await encryptNumberAndSend(user4, 95, realOwnerWallet.address));

       // ✅ Simulate Chainlink request (send encrypted numbers)
      const tx = await liminalDecryptNumbers.connect(realOwnerWallet).sendRequest(
          225, // Subscription ID
          encryptedNumbers
      );
      await tx.wait();
      console.log("✅ Chainlink request sent!");
      
      await delay(180000);

      // ✅ Log last request ID
      const lastRequestId = await liminalDecryptNumbers.s_lastRequestId();
      console.log("📌 Last Request ID:", lastRequestId);

      // ✅ Log last response (should contain decrypted numbers in raw bytes)
      const lastResponse = await liminalDecryptNumbers.s_lastResponse();
      console.log("📌 Last Response (Raw Bytes):", lastResponse.toString());

      // ✅ Log last error (if any)
      const lastError = await liminalDecryptNumbers.s_lastError();
      console.log("📌 Last Error (if any):", lastError.toString());

      // ✅ Log decrypted numbers (decoded result)
      const decryptedNumbersArray = await liminalDecryptNumbers.getDecryptedNumbers();
      console.log("🔢 Decrypted Numbers:", decryptedNumbersArray.map(n => n.toString()));

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
    
      // const publicKey = EthCrypto.publicKeyByPrivateKey(
      //     process.env.TESTNET_PRIVATE_KEY //0x59c6995e998f97a5a0044966f09453890ac986d28b93a39c2051ff1e6b8c32d3 first hardhat wallet
      // );

      // console.log("Public key:", publicKey);

      // Encrypt the number using the uncompressed public key
      const encrypted = await EthCrypto.encryptWithPublicKey(
          "99f74e85df79b14eb353ad7efff991f631bcd6aa831041171299e52084e064ec9cebd62c4067dfe317d08219e6659f465d2a881404790245d0ce747ca49b757b",
          JSON.stringify(number)
      );
  
      // Convert encrypted object to string
      const encryptedStringified =
        encrypted.iv + ":" +
        encrypted.ephemPublicKey + ":" +
        encrypted.ciphertext + ":" +
        encrypted.mac;

      //console.log("Encrypted :", encrypted.iv, encrypted.ephemPublicKey, encrypted.ciphertext, encrypted.mac);
      console.log("Encrypted stringified for number ", number,": ", encryptedStringified);
      return encryptedStringified;
  
      //return encryptedString;
    // Submit the encrypted string to the contract
    //await kaijiNoYurei.connect(user).selectNumber(encryptedString);
  }

  async function addConsumerToSubscription(subscriptionId, contractAddress) {
      console.log(`🔹 Adding contract ${contractAddress} as a consumer to subscription ${subscriptionId}...`);

      try {
          // ✅ Run the command as a shell process
          const output = execSync(
              `npx hardhat functions-sub-add --subscription-id ${subscriptionId} --contract ${contractAddress} --network arbitrumSepolia`,
              { encoding: "utf-8" } // Ensure output is readable
          );
          console.log(output);
          console.log("✅ Contract added as a consumer to the subscription!");
      } catch (error) {
          console.error("❌ Error adding contract to subscription:", error.message);
          process.exit(1);
      }
  }

  async function deployContract(contractName, owner) {
      const ContractFactory = owner != null ? await ethers.getContractFactory(contractName, owner) : await ethers.getContractFactory(contractName);
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
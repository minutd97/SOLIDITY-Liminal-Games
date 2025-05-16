const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
require("dotenv").config();

const FORK_MAINNET = process.env.FORK_MAINNET === "true";
const POOL_MANAGER = FORK_MAINNET ? "0x360e68faccca8ca495c1b759fd9eee466db9fb32" : "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317";
const POSITION_MANAGER = FORK_MAINNET ? "0xd88f38f930b7952f2db2432cb002e7abbf3dd869" : "0xAc631556d3d4019C95769033B5E719dD77124BAc";
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

describe("Presale contract test + V4 Pool Creation", function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    // Deploy LIM Token
    const LiminalToken = await ethers.getContractFactory("LiminalToken");
    const limToken = await LiminalToken.deploy();
    await limToken.waitForDeployment();

    // Deploy V4HookFactory
    const HookFactory = await ethers.getContractFactory("V4HookFactory");
    const hookFactory = await HookFactory.deploy();
    await hookFactory.waitForDeployment();

    const { salt, predicted, fullBytecode } = await findMatchingHookAddress(hookFactory.target, POOL_MANAGER);

    console.log("V4HookFactory :", hookFactory.target);
    //console.log("Will deploy V4Hook ↦", predicted, "with salt", salt);
    
    // CREATE V4 Hook Contract
    const tx = await hookFactory.create(fullBytecode, salt);
    await tx.wait();
    console.log("V4Hook deployed correctly :", predicted);

    // Deploy PoolHelper
    const PoolHelper = await ethers.getContractFactory("V4PoolHelper");
    const poolHelper = await PoolHelper.deploy(POOL_MANAGER, POSITION_MANAGER, PERMIT2_ADDRESS, predicted);
    await poolHelper.waitForDeployment();

    // Deploy LiminalPresale
    const minEthRequiered = ethers.parseEther("7");
    const LiminalPresale = await ethers.getContractFactory("LiminalPresale");
    const presale = await LiminalPresale.deploy(limToken.target, poolHelper.target, minEthRequiered);
    await presale.waitForDeployment();

    // Let the presale contract be the pool creator
    await poolHelper.grantCreatorRole(presale.target);

    const tokensForPool = ethers.parseUnits("35000000", 18); // 35 mil LIM
    await limToken.connect(owner).approve(presale.target, tokensForPool)
    await presale.connect(owner).depositPoolTokens(tokensForPool);

    const tokensForPresale = ethers.parseUnits("35000000", 18); // 35 mil LIM
    await limToken.connect(owner).approve(presale.target, tokensForPresale)
    await presale.connect(owner).depositPresaleTokens(tokensForPresale);

    return { owner, user1, user2, presale, poolHelper, limToken};
  }

  it("should accept contributions within limits", async function () {
    const { user1, presale } = await loadFixture(deployFixture);

    await presale.startPresale(3600); // 1 hour
    await presale.connect(user1).contribute({ value: ethers.parseEther("0.1") });

    const contribution = await presale.presaleContributions(user1.address);
    expect(contribution).to.equal(ethers.parseEther("0.1"));
  });

  it("should finalize and distribute tokens correctly", async function () {
    const { owner, presale, user1 } = await loadFixture(deployFixture);
    await presale.startPresale(3600); // 1-hour presale

    await testRemainingTime(presale, 10);

    const ethValue = ethers.parseEther("0.5");
    await presale.connect(user1).contribute({ value: ethValue });
    await testAllowedContribution(presale, user1.address);

    const userCount = 2;
    for (let i = 0; i < userCount; i++) {
        const wallet = ethers.Wallet.createRandom().connect(ethers.provider);

        // Fund the wallet with ETH
        await owner.sendTransaction({
            to: wallet.address,
            value: ethValue + ethers.parseEther("0.12"),
        });

        await presale.connect(wallet).contribute({ value: ethValue });
        //console.log(`User ${i + 1} contributed ${ethValue} ETH`);
    }
    console.log(`${userCount} users contributed ${ethValue} ETH each.`);

    await testGetterFunctions(presale);

    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine");

    // await presale.extendEndTime(3600);
    // await presale.extendEndTime(3600);
    // //await presale.extendEndTime(3600);

    // await ethers.provider.send("evm_increaseTime", [7300]);
    // await ethers.provider.send("evm_mine");

    await presale.endPresale();
    for (let i = 0; i < 1; i++){
        await presale.distributeTokens(100);
    }

    const totalPresaleTokens = await presale.totalPresaleTokens();
    expect(totalPresaleTokens).to.equal(0);
  });

  it("should refund users if min cap not reached", async function () {
    const { owner, user1, presale } = await loadFixture(deployFixture);

    await presale.startPresale(3600); // 1-hour presale

    const ethValue = ethers.parseEther("0.02");
    await presale.connect(user1).contribute({ value: ethValue });
    await testAllowedContribution(presale, user1.address);

    const userCount = 1;
    for (let i = 0; i < userCount; i++) {
        const wallet = ethers.Wallet.createRandom().connect(ethers.provider);

        // Fund the wallet with ETH
        await owner.sendTransaction({
            to: wallet.address,
            value: ethValue + ethers.parseEther("0.12"),
        });

        await presale.connect(wallet).contribute({ value: ethValue });
        //console.log(`User ${i + 1} contributed ${ethValue} ETH`);
    }
    console.log(`${userCount} users contributed ${ethValue} ETH each.`);

    await testGetterFunctions(presale);

    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine");

    await testRemainingTime(presale, 0);

    await presale.endPresale();
    for (let i = 0; i < 4; i++){
        await presale.refundUsers(100);
    }

    const ethBalance = await presale.totalContributions();
    expect(ethBalance).to.equal(0);
  });

  it("should finalize and distribute tokens correctly + V4 Pool Creation + V4 Swap", async function () {
    const { owner, presale } = await loadFixture(deployFixture);
    await presale.startPresale(3600); // 1-hour presale

    const ethValue = ethers.parseEther("0.5");
    const userCount = 14;
    for (let i = 0; i < userCount; i++) {
        const wallet = ethers.Wallet.createRandom().connect(ethers.provider);

        // Fund the wallet with ETH
        await owner.sendTransaction({
            to: wallet.address,
            value: ethValue + ethers.parseEther("0.12"),
        });

        await presale.connect(wallet).contribute({ value: ethValue });
        //console.log(`User ${i + 1} contributed ${ethValue} ETH`);
    }
    console.log(`${userCount} users contributed ${ethValue} ETH each.`);

    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine");

    await presale.endPresale();
    for (let i = 0; i < 1; i++){
        await presale.distributeTokens(100);
    }

    const tokensDistributed = await presale.tokensDistributed();
    console.log(`tokensDistributed : ${tokensDistributed}`);

    const totalPresaleTokens = await presale.totalPresaleTokens();
    expect(totalPresaleTokens).to.equal(0);

    await presale.createUniswapV4Pool();
    
    const totalPoolTokens = await presale.totalPoolTokens();
    expect(totalPoolTokens).to.equal(0);

    const totalContributions = await presale.totalContributions();
    expect(totalContributions).to.equal(0);
  });
});

async function testAllowedContribution(contract, buyer){
    const getAllowedContribution = await contract.getAllowedContribution(buyer);
    console.log(`getAllowedContribution : ${getAllowedContribution}`)
}

async function testRemainingTime(contract, timeToIncrease){
    await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
    await ethers.provider.send("evm_mine");
    
    const getRemainingTime = await contract.getRemainingTime();
    console.log(`getRemainingTime : ${getRemainingTime}`)
}

async function testGetterFunctions(contract){
    const minCapNotReached = await contract.minCapReached();
    console.log(`minCapNotReached : ${minCapNotReached}`)

    const buyersCount = await contract.getBuyersCount();
    console.log(`buyersCount : ${buyersCount}`)
}

async function findMatchingHookAddress(factoryAddress, poolManagerAddress) {
  const factory = await ethers.getContractFactory("V4Hook");

  // build init code with the pool manager arg
  const encodedArgs  = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [poolManagerAddress]);
  const fullBytecode = factory.bytecode + encodedArgs.slice(2);
  const bytecodeHash = ethers.keccak256(fullBytecode);

  // <-- corrected mask includes the 1<<6 bit for afterSwap
  const expectedBits = BigInt((1<<12)|(1<<10)|(1<<8)|(1<<6)); // 0x1540n

  for (let salt = 0; salt < 1_000_000; salt++) {
    const saltHex   = ethers.toBeHex(salt, 32);
    const predicted = ethers.getCreate2Address(
      factoryAddress,  // <<< use the on-chain factory's address here
      saltHex,
      bytecodeHash
    );
    if ((BigInt(predicted) & 0x3FFFn) === expectedBits) {
      return { salt, predicted, fullBytecode };
    }
  }
  throw new Error("No matching address found");
}

async function log_EthBalance(address, name) {
    let ethBalance = await ethers.provider.getBalance(address);
    console.log(`${name} ETH BALANCE: ${ethers.formatEther(ethBalance)}`);
}
  
async function log_TokenBalance(token, tokenName, userAddr, userName){
    let tokenBalance = await token.balanceOf(userAddr);
    console.log(`${userName} ${tokenName} BALANCE: ${ethers.formatEther(tokenBalance)}`);
}

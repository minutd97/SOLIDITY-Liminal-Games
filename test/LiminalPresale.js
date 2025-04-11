const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
require("dotenv").config();

const FORK_MAINNET = process.env.FORK_MAINNET;
const POOL_MANAGER = FORK_MAINNET ? "0x360e68faccca8ca495c1b759fd9eee466db9fb32" : "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317";
const POSITION_MANAGER = FORK_MAINNET ? "0xd88f38f930b7952f2db2432cb002e7abbf3dd869" : "0xAc631556d3d4019C95769033B5E719dD77124BAc";
const PERMIT2_ADDRESS = FORK_MAINNET ? "0x000000000022D473030F116dDEE9F6B43aC78BA3" : "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768";
const UNIVERSAL_ROUTER = FORK_MAINNET ? "0xa51afafe0263b40edaef0df8781ea9aa03e381a3" : "0xefd1d4bd4cf1e86da286bb4cb1b8bced9c10ba47";

describe("LiminalPresale", function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    // Deploy LIM Token
    const LiminalToken = await ethers.getContractFactory("LiminalToken");
    const lim = await LiminalToken.deploy();
    await lim.waitForDeployment();

    // Deploy PoolHelper
    const PoolHelper = await ethers.getContractFactory("V4PoolHelper");
    const poolHelper = await PoolHelper.deploy(POOL_MANAGER, POSITION_MANAGER, PERMIT2_ADDRESS);
    await poolHelper.waitForDeployment();

    // Deploy SwapHelper
    const SwapHelper = await ethers.getContractFactory("V4SwapHelper");
    const swapHelper = await SwapHelper.deploy(UNIVERSAL_ROUTER, POOL_MANAGER, PERMIT2_ADDRESS);
    await swapHelper.waitForDeployment();

    // Deploy LiminalPresale
    const LiminalPresale = await ethers.getContractFactory("LiminalPresale");
    const presale = await LiminalPresale.deploy(lim.target, poolHelper.target);
    await presale.waitForDeployment();

    const tokensForPool = ethers.parseUnits("30000000", 18); // 30 mil LIM
    await lim.connect(owner).approve(presale.target, tokensForPool)
    await presale.connect(owner).depositPoolTokens(tokensForPool);

    const tokensForPresale = ethers.parseUnits("30000000", 18); // 30 mil LIM
    await lim.connect(owner).approve(presale.target, tokensForPresale)
    await presale.connect(owner).depositPresaleTokens(tokensForPresale);

    return { owner, user1, user2, lim, presale, swapHelper};
  }

//   it("should accept contributions within limits", async function () {
//     const { user1, presale } = await loadFixture(deployFixture);

//     await presale.startPresale(3600); // 1 hour
//     await presale.connect(user1).contribute({ value: ethers.parseEther("0.1") });

//     const contribution = await presale.presaleContributions(user1.address);
//     expect(contribution).to.equal(ethers.parseEther("0.1"));
//   });

//   it("should finalize and distribute tokens correctly", async function () {
//     const { owner, presale, lim, user1 } = await loadFixture(deployFixture);
//     await presale.startPresale(3600); // 1-hour presale

//     const initialPresaleTokens = await presale.totalPresaleTokens();
//     await testRemainingTime(presale, 10);

//     const ethValue = ethers.parseEther("0.5");
//     await presale.connect(user1).contribute({ value: ethValue });
//     await testAllowedContribution(presale, user1.address);

//     const userCount = 19;
//     for (let i = 0; i < userCount; i++) {
//         const wallet = ethers.Wallet.createRandom().connect(ethers.provider);

//         // Fund the wallet with ETH
//         await owner.sendTransaction({
//             to: wallet.address,
//             value: ethValue + ethers.parseEther("0.12"),
//         });

//         await presale.connect(wallet).contribute({ value: ethValue });
//         //console.log(`User ${i + 1} contributed ${ethValue} ETH`);
//     }
//     console.log(`${userCount} users contributed ${ethValue} ETH each.`);

//     await testGetterFunctions(presale);

//     await ethers.provider.send("evm_increaseTime", [3600]);
//     await ethers.provider.send("evm_mine");

//     // await presale.extendEndTime(3600);
//     // await presale.extendEndTime(3600);
//     // //await presale.extendEndTime(3600);

//     // await ethers.provider.send("evm_increaseTime", [7300]);
//     // await ethers.provider.send("evm_mine");

//     await presale.endPresale();
//     for (let i = 0; i < 1; i++){
//         await presale.distributeTokens(100);
//     }

//     const tokenRate = await presale.LIM_TOKEN_RATE();
//     const totalContributions = await presale.totalContributions();
//     const diference = initialPresaleTokens - (tokenRate * totalContributions);

//     const totalPresaleTokens = await presale.totalPresaleTokens();
//     expect(diference).to.equal(totalPresaleTokens);
//   });

//   it("should refund users if min cap not reached", async function () {
//     const { owner, user1, presale } = await loadFixture(deployFixture);

//     await presale.startPresale(3600); // 1-hour presale

//     const ethValue = ethers.parseEther("0.02");
//     await presale.connect(user1).contribute({ value: ethValue });
//     await testAllowedContribution(presale, user1.address);

//     const userCount = 348;
//     for (let i = 0; i < userCount; i++) {
//         const wallet = ethers.Wallet.createRandom().connect(ethers.provider);

//         // Fund the wallet with ETH
//         await owner.sendTransaction({
//             to: wallet.address,
//             value: ethValue + ethers.parseEther("0.12"),
//         });

//         await presale.connect(wallet).contribute({ value: ethValue });
//         //console.log(`User ${i + 1} contributed ${ethValue} ETH`);
//     }
//     console.log(`${userCount} users contributed ${ethValue} ETH each.`);

//     await testGetterFunctions(presale);

//     await ethers.provider.send("evm_increaseTime", [3600]);
//     await ethers.provider.send("evm_mine");

//     await testRemainingTime(presale, 0);

//     await presale.endPresale();
//     for (let i = 0; i < 4; i++){
//         await presale.refundUsers(100);
//     }

//     const ethBalance = await presale.totalContributions();
//     expect(ethBalance).to.equal(0);
//   });

it("should finalize and distribute tokens correctly + V4 Pool Creation + V4 Swap", async function () {
    const { owner, presale, lim, user1, swapHelper } = await loadFixture(deployFixture);
    await presale.startPresale(3600); // 1-hour presale

    const initialPresaleTokens = await presale.totalPresaleTokens();

    const ethValue = ethers.parseEther("0.5");
    const userCount = 19;
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

    const tokenRate = await presale.LIM_TOKEN_RATE();
    const totalContributions = await presale.totalContributions();
    const diference = initialPresaleTokens - (tokenRate * totalContributions);

    const totalPresaleTokens = await presale.totalPresaleTokens();
    expect(diference).to.equal(totalPresaleTokens);
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

    const getRemainingCap = await contract.getRemainingCap();
    console.log(`getRemainingCap : ${getRemainingCap}`)
}

async function log_EthBalance(address, name) {
    let ethBalance = await ethers.provider.getBalance(address);
    console.log(`${name} ETH BALANCE: ${ethers.formatEther(ethBalance)}`);
  }
  
async function log_TokenBalance(token, tokenName, userAddr, userName){
    let tokenBalance = await token.balanceOf(userAddr);
    console.log(`${userName} ${tokenName} BALANCE: ${ethers.formatEther(tokenBalance)}`);
}

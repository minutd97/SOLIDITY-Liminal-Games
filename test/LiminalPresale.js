const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LiminalPresale", function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    const LiminalToken = await ethers.getContractFactory("LiminalToken");
    const lim = await LiminalToken.deploy();
    await lim.waitForDeployment();

    const LiminalPresale = await ethers.getContractFactory("LiminalPresale");
    const presale = await LiminalPresale.deploy(lim.target);
    await presale.waitForDeployment();

    const tokensForPool = ethers.parseUnits("30000000", 18); // 30 mil LIM
    await lim.connect(owner).approve(presale.target, tokensForPool)
    await presale.connect(owner).depositPoolTokens(tokensForPool);

    const tokensForPresale = ethers.parseUnits("30000000", 18); // 30 mil LIM
    await lim.connect(owner).approve(presale.target, tokensForPresale)
    await presale.connect(owner).depositPresaleTokens(tokensForPresale);

    return { owner, user1, user2, lim, presale };
  }

  it("should accept contributions within limits", async function () {
    const { user1, presale } = await loadFixture(deployFixture);

    await presale.startPresale(3600); // 1 hour
    await presale.connect(user1).contribute({ value: ethers.parseEther("0.1") });

    const contribution = await presale.presaleContributions(user1.address);
    expect(contribution).to.equal(ethers.parseEther("0.1"));
  });

  it("should finalize and distribute tokens correctly", async function () {
    const { owner, presale, lim, user1 } = await loadFixture(deployFixture);
    await presale.startPresale(3600); // 1-hour presale

    await testRemainingTime(presale, 10);

    const ethValue = ethers.parseEther("0.5");
    await presale.connect(user1).contribute({ value: ethValue });
    await testAllowedContribution(presale, user1.address);

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

    const balance = await presale.totalPresaleTokens();
    expect(balance).to.equal(0);
  });

  it("should refund users if min cap not reached", async function () {
    const { owner, user1, presale } = await loadFixture(deployFixture);

    await presale.startPresale(3600); // 1-hour presale

    const ethValue = ethers.parseEther("0.02");
    await presale.connect(user1).contribute({ value: ethValue });
    await testAllowedContribution(presale, user1.address);

    const userCount = 348;
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

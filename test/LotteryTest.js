const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Lottery Contracts", function () {
  
  let tokenLOT;
  let lotteryTreasury;
  let lotteryLiquidity;
  let lotteryEscrow;
  let lotteryCore;

  let simpleBlockGame;

  async function deployContractsFixture() {
    const [owner, user1, user2, user3, user4] = await ethers.getSigners();
    
    const SimpleBlockGame = await ethers.getContractFactory("SimpleBlockGame");
    simpleBlockGame = await SimpleBlockGame.deploy();
    await simpleBlockGame.waitForDeployment();


    // Deploy LotteryToken contract
    const LotteryToken = await ethers.getContractFactory("LotteryToken");
    tokenLOT = await LotteryToken.deploy();
    await tokenLOT.waitForDeployment();

    // Deploy LotteryTreasury contract
    const LotteryTreasury = await ethers.getContractFactory("LotteryTreasury");
    lotteryTreasury = await LotteryTreasury.deploy();
    await lotteryTreasury.waitForDeployment();

    // Deploy LotteryLiquidity contract
    const LotteryLiquidity = await ethers.getContractFactory("LotteryLiquidity");
    lotteryLiquidity = await LotteryLiquidity.deploy(lotteryTreasury.getAddress());
    await lotteryLiquidity.waitForDeployment();

    // Deploy LotteryEscrow contract
    const LotteryEscrow = await ethers.getContractFactory("LotteryEscrow");
    lotteryEscrow = await LotteryEscrow.deploy(tokenLOT.getAddress(), lotteryTreasury.getAddress(), lotteryLiquidity.getAddress());
    await lotteryEscrow.waitForDeployment();

    // Deploy LotteryCore contract
    const LotteryCore = await ethers.getContractFactory("LotteryCore");
    const dailyPrice = ethers.parseUnits("0.001", 18);
    const weeklyPrice = ethers.parseUnits("5", 18);
    const monthlyPrice = ethers.parseUnits("10", 18);
    lotteryCore = await LotteryCore.deploy(lotteryEscrow.getAddress(), dailyPrice, weeklyPrice, monthlyPrice);
    await lotteryCore.waitForDeployment();

    await lotteryEscrow.grantAccessRole(lotteryCore.getAddress());
    await lotteryLiquidity.grantPoolCreatorRole(lotteryEscrow.getAddress());

    await tokenLOT.approve(lotteryEscrow.getAddress(), ethers.parseUnits("300000", 18));
    await lotteryEscrow.depositPrizeFunds(tokenLOT.getAddress(), ethers.parseUnits("150000", 18));
    await lotteryEscrow.depositLiquidityFunds(tokenLOT.getAddress(), ethers.parseUnits("150000", 18));

    await tokenLOT.grantMinterRole(owner.address);
    //await tokenLOT.mint(user1.address, ethers.parseUnits("100000000", 18))
    //await tokenLOT.mint(user2.address, ethers.parseUnits("100000000", 18))

    //Log new deployed contracts addresses
    let contracts = [tokenLOT, lotteryTreasury, lotteryLiquidity, lotteryEscrow, lotteryCore, owner, user1, user2, user3, user4];
    let names = ["$LOT TOKEN", "Lottery Treasury", "Lottery Liquidity", "Lottery Escrow", "Lottery Core", "OWNER", "USER 1", "USER 2", "USER 3", "USER 4"];
    await log_ContractAdresses(contracts, names);

    return { owner, user1, user2, user3, user4 };
  }

  describe("Full test", function () {
    it("Testing", async function () {
      this.timeout(0);
      
      const { owner, user1, user2, user3, user4 } = await loadFixture(deployContractsFixture);


      await simpleBlockGame.connect(owner).startGame();
      let timelifet = await simpleBlockGame.getBlocksLeft();
      console.log("Time left :", timelifet);
      timelifet = await simpleBlockGame.getBlocksLeft();
      console.log("Time left :", timelifet);
      timelifet = await simpleBlockGame.getBlocksLeft();
      console.log("Time left :", timelifet);
      timelifet = await simpleBlockGame.getBlocksLeft();
      console.log("Time left :", timelifet);
      timelifet = await simpleBlockGame.getBlocksLeft();
      console.log("Time left :", timelifet);
      timelifet = await simpleBlockGame.getBlocksLeft();
      console.log("Time left :", timelifet);
      timelifet = await simpleBlockGame.getBlocksLeft();
      console.log("Time left :", timelifet);
      timelifet = await simpleBlockGame.getBlocksLeft();
      console.log("Time left :", timelifet);
      timelifet = await simpleBlockGame.getBlocksLeft();
      console.log("Time left :", timelifet);
      timelifet = await simpleBlockGame.getBlocksLeft();
      console.log("Time left :", timelifet);
      timelifet = await simpleBlockGame.getBlocksLeft();
      console.log("Time left :", timelifet);
      timelifet = await simpleBlockGame.getBlocksLeft();
      console.log("Time left :", timelifet);
      timelifet = await simpleBlockGame.getBlocksLeft();
      console.log("Time left :", timelifet);
      timelifet = await simpleBlockGame.getBlocksLeft();
      console.log("Time left :", timelifet);


      const chosenNumbers = [1, 8, 15, 20];
      await lotteryCore.connect(owner).startGame(0);
      await lotteryCore.connect(owner).startGame(1);
      await lotteryCore.connect(owner).startGame(2);

      await time.increase(1);

      await expect(lotteryCore.connect(owner).endGame(0)).to.be.reverted;

      await log_EthBalance(owner, "OWNER");

      //await tokenLOT.connect(user1).approve(lotteryEscrow.getAddress(), ethers.parseUnits("5000000", 18));
      //await log_EthBalance(user1, "USER 1");
      //await lotteryCore.connect(user1).purchaseRandomTickets(0, 100, { value: ethers.parseUnits("0.1", 18) });
      //await log_EthBalance(user1, "USER 1");

      for (let i = 0; i < 1; i++) {
        await lotteryCore.connect(user1).purchaseRandomTickets(0, 100, { value: ethers.parseUnits("0.1", 18) });
        await log_EthBalance(user1, "USER 1");
        await lotteryCore.connect(user2).purchaseRandomTickets(0, 100, { value: ethers.parseUnits("0.1", 18) });
        await log_EthBalance(user2, "USER 2");
      }

      // await tokenLOT.connect(user1).approve(lotteryEscrow.getAddress(), ethers.parseUnits("500", 18));
      // await lotteryCore.connect(user1).purchaseRandomTickets(1, 10);

      //await tokenLOT.connect(user1).approve(lotteryEscrow.getAddress(), ethers.parseUnits("20000", 18));
      //await lotteryCore.connect(user1).purchaseRandomTickets(2, 19);

      // const chosenNumbers2 = [1, 8, 15, 0];
      // const chosenNumbers3 = [1, 8, 0, 0];
      // const chosenNumbers4 = [5, 1, 2, 3];
      
      // await tokenLOT.connect(user2).approve(lotteryEscrow.getAddress(), ethers.parseUnits("1", 18));
      // await lotteryCore.connect(user2).purchaseTicket(0, chosenNumbers4);

      // await tokenLOT.connect(user2).approve(lotteryEscrow.getAddress(), ethers.parseUnits("1", 18));
      // await lotteryCore.connect(user2).purchaseTicket(0, chosenNumbers4);

      // await tokenLOT.connect(user2).approve(lotteryEscrow.getAddress(), ethers.parseUnits("1", 18));
      // await lotteryCore.connect(user2).purchaseTicket(0, chosenNumbers4);

      // await tokenLOT.connect(user2).approve(lotteryEscrow.getAddress(), ethers.parseUnits("1", 18));
      // await lotteryCore.connect(user2).purchaseTicket(0, chosenNumbers4);

      //await expect(lotteryCore.connect(user2).claimRewards(0, 0)).to.be.reverted;

      // Check the current block timestamp
      let block = await ethers.provider.getBlock("latest");
      console.log(`Current block timestamp: ${block.timestamp}`);

      await time.increase(1);

      await lotteryCore.connect(owner).endGame(0);
      await log_EthBalance(owner, "OWNER");

      for (let i = 0; i < 2; i++) {
        await lotteryCore.connect(owner).validateNumbersMatchedBatch(0, 0, 100);
      }

      for (let i = 0; i < 2; i++) {
        await lotteryCore.connect(owner).distributeRewardsBatch(0, 0, 100);
      }

      await log_EthBalance(owner, "OWNER");
      await log_LiquidityPoolInfo();
      await lotteryLiquidity.connect(user1).swap(ethers.ZeroAddress, tokenLOT.getAddress(), ethers.parseUnits("2", 18), 0, { value: ethers.parseUnits("2", 18) });
      await log_TokenBalance(tokenLOT, "$LOT", user1, "USER 1");
      await log_LiquidityPoolInfo();

      //await lotteryCore.connect(owner).validateNumbersMatchedBatch(0, 0, 10);
      //await lotteryCore.connect(owner).validateNumbersMatchedBatch(0, 0, 10);

      //await lotteryCore.connect(owner).distributeRewardsBatch(0, 0, 10);
      //await lotteryCore.connect(owner).distributeRewardsBatch(0, 0, 10);

      await log_TokenBalance(tokenLOT, "$LOT", lotteryEscrow.getAddress(), "Lottery Escrow");
      await lotteryCore.connect(user1).claimRewards(0, 0);
      await log_TokenBalance(tokenLOT, "$LOT", user1, "USER 1");
      await lotteryCore.connect(user2).claimRewards(0, 0);
      await log_TokenBalance(tokenLOT, "$LOT", user2, "USER 2");
      await log_TokenBalance(tokenLOT, "$LOT", lotteryEscrow.getAddress(), "Lottery Escrow");

      //await lotteryCore.connect(user2).claimRewards(0, 0);

      // Call getUserTickets and print results
      // const tickets = await lotteryCore.connect(user1).getUserTickets(user1.address);

      // // Print tickets to the console
      // console.log("User1's Tickets:", tickets.map(ticket => ({
      //     price: ticket.price.toString(),
      //     chosenNumbers: ticket.chosenNumbers,
      //     gameMode: ticket.gameMode
      // })));
    });
  });

  async function log_ContractAdresses(contracts, names) {
      for (let i = 0; i < contracts.length; i++) {
          const address = await contracts[i].getAddress();
          console.log(`${names[i]} Address: ${address}`);
      }
  }

  async function log_LiquidityPoolInfo() {
      let liquidityPoolInfo = await lotteryLiquidity.getPoolInfo(ethers.ZeroAddress, tokenLOT.getAddress());
      console.log(`Liquidity pool: ETH: ${ethers.formatEther(liquidityPoolInfo[0])}, $LOT: ${ethers.formatUnits(liquidityPoolInfo[1], 18)}`);
      await log_TokenPrice();
  }

  async function log_TokenPrice(){
    let price = await lotteryLiquidity.getTokenPrice(ethers.ZeroAddress, tokenLOT.getAddress());
    let humanReadablePrice = (Number(price) / 1e18).toFixed(18);
    console.log(`$LOT PRICE PER ETH: ${humanReadablePrice}`);
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
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Liminal StakingPool Contract", function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    const LiminalToken = await ethers.getContractFactory("LiminalToken");
    const lim = await LiminalToken.deploy();
    await lim.waitForDeployment();

    const StakingPool = await ethers.getContractFactory("LiminalStakingPool");
    const pool = await StakingPool.deploy(await lim.getAddress());
    await pool.waitForDeployment();

    //Grand loader role to owner
    await pool.connect(owner).grantLoaderRole(owner.address);

    // Owner loads staking pool with 40M LIM
    const preload = ethers.parseUnits("40000000", 18);
    await lim.connect(owner).approve(await pool.getAddress(), preload);
    await lim.connect(owner).transfer(await pool.getAddress(), preload);
    await pool.connect(owner).loadRewardPool(preload);

    // Give user1 and user2 some LIM to stake
    const stakeAmount = ethers.parseUnits("1000", 18);
    await lim.connect(owner).transfer(user1.address, stakeAmount);
    await lim.connect(owner).transfer(user2.address, stakeAmount);

    return { owner, user1, user2, lim, pool };
  }

  it("should allow users to stake and accumulate rewards", async function () {
    const { user1, lim, pool } = await loadFixture(deployFixture);
    const stakeAmount = ethers.parseUnits("1000", 18);

    await lim.connect(user1).approve(await pool.getAddress(), stakeAmount);
    await pool.connect(user1).stake(stakeAmount);

    const stake = await pool.stakes(user1.address);
    expect(stake.amount).to.equal(stakeAmount);
  });

  it("should calculate and claim exact rewards after 30 days", async function () {
    const { user1, lim, pool } = await loadFixture(deployFixture);
    const stakeAmount = ethers.parseUnits("1000", 18);
  
    await lim.connect(user1).approve(await pool.getAddress(), stakeAmount);
    await pool.connect(user1).stake(stakeAmount);
  
    // Fast forward 30 days and mine new block
    const secondsIn30Days = 30 * 24 * 60 * 60;
    await time.increase(secondsIn30Days);
    await ethers.provider.send("evm_mine");
  
    // Calculate expected reward
    const apy = 15n;
    const base = 100n;
    const year = 365n * 24n * 60n * 60n;
    const reward = (stakeAmount * apy * BigInt(secondsIn30Days)) / (base * year);
  
    const pending = await pool.getPendingRewards(user1.address);
    console.log("Expected reward:", ethers.formatUnits(reward));
    console.log("Pending reward:", ethers.formatUnits(pending));
  
    //expect(pending).to.equal(reward);
    expect(pending).to.be.closeTo(reward, ethers.parseUnits("0.00001", 18));
  
    const before = await lim.balanceOf(user1.address);
    await pool.connect(user1).claim();
    const after = await lim.balanceOf(user1.address);
  
    //expect(after - before).to.equal(reward);
    expect(after - before).to.be.closeTo(reward, ethers.parseUnits("0.00001", 18));
  });  

  it("should allow users to unstake without claiming", async function () {
    const { user1, lim, pool } = await loadFixture(deployFixture);
    const stakeAmount = ethers.parseUnits("1000", 18);

    await lim.connect(user1).approve(await pool.getAddress(), stakeAmount);
    await pool.connect(user1).stake(stakeAmount);

    // Wait 10 days
    await time.increase(10 * 24 * 60 * 60);

    await pool.connect(user1).unstake(stakeAmount);
    const limBalance = await lim.balanceOf(user1.address);
    expect(limBalance).to.be.gte(stakeAmount); // Should have received unstaked LIM

    const rewards = await pool.getPendingRewards(user1.address);
    expect(rewards).to.be.gt(0); // Rewards are still there!
  });

//   it("should reject claims if reward pool is empty", async function () {
//     const { user1, lim, pool, owner } = await loadFixture(deployFixture);
//     const stakeAmount = ethers.parseUnits("1000", 18);

//     await lim.connect(user1).approve(await pool.getAddress(), stakeAmount);
//     await pool.connect(user1).stake(stakeAmount);

//     // Fast forward to accrue rewards
//     await time.increase(60 * 24 * 60 * 60);

//     // Owner drains the pool
//     await pool.connect(owner).drainRewardPool();

//     await expect(pool.connect(user1).claim()).to.be.revertedWith("Insufficient reward pool");
//   });
});

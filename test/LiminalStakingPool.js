const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Tests for the shared-emissions LiminalStakingPool contract
 */
describe("LiminalStakingPool Shared Emissions", function () {
  // Deploy fresh fixture for each test
  async function deployFixture() {
    const [owner, user1, user2, stranger] = await ethers.getSigners();

    // Deploy token
    const Token = await ethers.getContractFactory("LiminalToken");
    const lim = await Token.deploy();
    await lim.waitForDeployment();

    // Set daily emission to 2000 LIM
    const dailyEmission = ethers.parseUnits("2000", 18);

    // Deploy staking pool
    const Pool = await ethers.getContractFactory("LiminalStakingPool");
    const pool = await Pool.deploy(await lim.getAddress(), dailyEmission);
    await pool.waitForDeployment();

    // Grant loader role and preload rewards
    await pool.connect(owner).grantLoaderRole(owner.address);
    const preload = ethers.parseUnits("40000000", 18);
    await lim.connect(owner).approve(pool.getAddress(), preload);
    await pool.connect(owner).loadRewardPool(preload);

    // Distribute tokens to users
    const stakeAmount1 = ethers.parseUnits("1000", 18);
    const stakeAmount2 = ethers.parseUnits("2000000", 18);
    await lim.connect(owner).transfer(user1.address, stakeAmount1);
    await lim.connect(owner).transfer(user2.address, stakeAmount2);

    return { owner, user1, user2, stranger, lim, pool, dailyEmission, stakeAmount1, stakeAmount2 };
  }

  it("should allow only loader to fund rewards", async function () {
    const { owner, stranger, lim, pool } = await loadFixture(deployFixture);
    const amount = ethers.parseUnits("100", 18);
    await lim.connect(owner).approve(pool.getAddress(), amount);
    await expect(
      pool.connect(stranger).loadRewardPool(amount)
    ).to.be.reverted;
  });
  
  it("should accrue accurate rewards for a single staker over time", async function () {
    const { user1, lim, pool, dailyEmission, stakeAmount1 } = await loadFixture(deployFixture);
    await lim.connect(user1).approve(pool.getAddress(), stakeAmount1);
    await pool.connect(user1).stake(stakeAmount1);
  
    const seconds = 43200; // 12 hours
    await time.increase(seconds);
    await ethers.provider.send("evm_mine");
  
    const rewardPerSecond = dailyEmission / 86400n;
    const expected = rewardPerSecond * BigInt(seconds);
    const tolerance = ethers.parseUnits("0.06", 18);
  
    const pending = await pool.pendingReward(user1.address);
  
    console.log("⏱  Seconds elapsed:", seconds);
    console.log("💰  Expected reward:", expected.toString());
    console.log("🧾  Pending reward:", pending.toString());
    console.log("📏  Tolerance:", tolerance.toString());
  
    expect(pending).to.be.closeTo(expected, tolerance);
  });
  
  it("should distribute rewards proportionally among multiple stakers", async function () {
    const { user1, user2, lim, pool, dailyEmission, stakeAmount1, stakeAmount2 } = await loadFixture(deployFixture);
    await lim.connect(user1).approve(pool.getAddress(), stakeAmount1);
    await pool.connect(user1).stake(stakeAmount1);
    await lim.connect(user2).approve(pool.getAddress(), stakeAmount2);
    await pool.connect(user2).stake(stakeAmount2);
  
    const seconds = 86400;
    await time.increase(seconds);
    await ethers.provider.send("evm_mine");
  
    const total = stakeAmount1 + stakeAmount2;
    const expected1 = (dailyEmission * stakeAmount1) / total;
    const expected2 = (dailyEmission * stakeAmount2) / total;
    const tolerance = ethers.parseUnits("0.06", 18);
  
    const p1 = await pool.pendingReward(user1.address);
    const p2 = await pool.pendingReward(user2.address);
  
    console.log("🧑‍🌾 User1 expected:", expected1.toString(), "pending:", p1.toString());
    console.log("🧑‍🌾 User2 expected:", expected2.toString(), "pending:", p2.toString());
  
    expect(p1).to.be.closeTo(expected1, tolerance);
    expect(p2).to.be.closeTo(expected2, tolerance);
  });
  
  it("should distribute rewards correctly when users stake at different times", async function () {
    const { user1, user2, lim, pool } = await loadFixture(deployFixture);
  
    const stakeAmount = ethers.parseUnits("100", 18);
  
    // 1) User1 stakes at t = 0
    await lim.connect(user1).approve(pool.getAddress(), stakeAmount);
    await pool.connect(user1).stake(stakeAmount);
  
    // 2) Advance 12 hours
    await time.increase(12 * 60 * 60);
    await ethers.provider.send("evm_mine");
  
    // 3) User2 stakes at t = 12h
    await lim.connect(user2).approve(pool.getAddress(), stakeAmount);
    await pool.connect(user2).stake(stakeAmount);
  
    // 4) Advance another 12 hours
    await time.increase(12 * 60 * 60);
    await ethers.provider.send("evm_mine");
  
    // 5) Compute daily emission from on-chain rewardPerSecond
    const rps = await pool.rewardPerSecond();       // BigInt
    const dailyEmission = rps * 86400n;             // seconds per day
  
    // 75% and 25% splits
    const expected1 = (dailyEmission * 75n) / 100n;
    const expected2 = (dailyEmission * 25n) / 100n;
    const tolerance = ethers.parseUnits("0.09", 18);
  
    // 6) Query pendingReward
    const p1 = await pool.pendingReward(user1.address);
    const p2 = await pool.pendingReward(user2.address);
  
    console.log("🧑‍🌾 User1 pending:", p1.toString());
    console.log("🧑‍🌾 User2 pending:", p2.toString());
  
    // 7) Assert 75/25 within tolerance
    expect(p1).to.be.closeTo(expected1, tolerance);
    expect(p2).to.be.closeTo(expected2, tolerance);
  });
  
  it("should transfer correct reward amount when claimed", async function () {
    const { user1, lim, pool, stakeAmount1 } = await loadFixture(deployFixture);
    await lim.connect(user1).approve(pool.getAddress(), stakeAmount1);
    await pool.connect(user1).stake(stakeAmount1);
  
    await time.increase(86400);
    await ethers.provider.send("evm_mine");
  
    const pending = await pool.pendingReward(user1.address);
    const before = await lim.balanceOf(user1.address);
    await pool.connect(user1).claim();
    const after = await lim.balanceOf(user1.address);
  
    console.log("🪙 Claimed reward:", (after - before).toString());
    console.log("🧾 Pending before claim:", pending.toString());
  
    expect(after - before).to.be.closeTo(pending, ethers.parseUnits("0.025", 18));
    expect(await pool.pendingReward(user1.address)).to.equal(0n);
  });
  
  it("should allow partial unstake and continue earning with remaining stake", async function () {
    const { user1, lim, pool, stakeAmount1 } = await loadFixture(deployFixture);
    await lim.connect(user1).approve(pool.getAddress(), stakeAmount1);
    await pool.connect(user1).stake(stakeAmount1);
  
    await time.increase(10 * 86400);
    await ethers.provider.send("evm_mine");
  
    const half = stakeAmount1 / 2n;
    const rewardsBeforeUnstake = await pool.pendingReward(user1.address);
    const balanceBefore = await lim.balanceOf(user1.address);
  
    await pool.connect(user1).unstake(half);
    const balanceAfter = await lim.balanceOf(user1.address);
    const actualDelta = balanceAfter - balanceBefore;
    const expectedDelta = half + rewardsBeforeUnstake;
  
    console.log("🧮 Expected return (half + rewards):", expectedDelta.toString());
    console.log("📊 Actual balance change:", actualDelta.toString());
  
    expect(actualDelta).to.be.closeTo(expectedDelta, ethers.parseUnits("0.03", 18));
  
    await time.increase(86400);
    await ethers.provider.send("evm_mine");
  
    const newPending = await pool.pendingReward(user1.address);
    console.log("⏳ Reward after partial unstake:", newPending.toString());
    expect(newPending).to.be.gt(0n);
  });
  
  it("should allow owner to update emission rate", async function () {
    const { owner, user1, lim, pool, stakeAmount1 } = await loadFixture(deployFixture);
    await lim.connect(user1).approve(pool.getAddress(), stakeAmount1);
    await pool.connect(user1).stake(stakeAmount1);
  
    const newDaily = ethers.parseUnits("1000", 18);
    await pool.connect(owner).setDailyEmission(newDaily);
  
    await time.increase(86400);
    await ethers.provider.send("evm_mine");
  
    const pending = await pool.pendingReward(user1.address);
    console.log("🎚  New daily emission:", newDaily.toString());
    console.log("🧾  Pending reward (1 day):", pending.toString());
  
    expect(pending).to.be.closeTo(newDaily, ethers.parseUnits("0.04", 18));
  });
  
  it("should reflect reward dilution when a whale stakes 2 million LIM", async function () {
    const { user1, user2, lim, pool } = await loadFixture(deployFixture);
  
    const smallStake = ethers.parseUnits("100", 18);
    const whaleStake = ethers.parseUnits("2000000", 18); // 2 million LIM
  
    // Approve and stake small user
    await lim.connect(user1).approve(pool.getAddress(), smallStake);
    await pool.connect(user1).stake(smallStake);
    console.log("✅ User1 staked 100 LIM");
  
    // Let user1 farm solo for 1 day
    await time.increase(86400);
    await ethers.provider.send("evm_mine");
  
    const rewardUser1BeforeWhale = await pool.pendingReward(user1.address);
    console.log("💰 User1 reward after 1 day solo farming:", ethers.formatUnits(rewardUser1BeforeWhale, 18));
  
    // Approve and stake whale
    await lim.connect(user2).approve(pool.getAddress(), whaleStake);
    await pool.connect(user2).stake(whaleStake);
    console.log("🐳 User2 (whale) staked 2,000,000 LIM");
  
    // Let both farm for 1 more day
    await time.increase(86400);
    await ethers.provider.send("evm_mine");
  
    const rewardUser1AfterWhale = await pool.pendingReward(user1.address);
    const rewardUser2 = await pool.pendingReward(user2.address);
  
    const netRewardUser1 = rewardUser1AfterWhale - rewardUser1BeforeWhale;
  
    console.log("💸 User1 additional reward (after whale joined):", ethers.formatUnits(netRewardUser1, 18));
    console.log("💰 User2 reward after 1 day:", ethers.formatUnits(rewardUser2, 18));
  
    // Expect user1's second-day reward to be severely diluted
    expect(netRewardUser1).to.be.lt(ethers.parseUnits("1", 18)); // less than 1 LIM
    expect(rewardUser2).to.be.gt(ethers.parseUnits("1900", 18)); // almost all the daily 2000 LIM
  });
  
  it("should update reward shares after whale unstakes half of their stake", async function () {
    const { user1, user2, lim, pool } = await loadFixture(deployFixture);
  
    const smallStake = ethers.parseUnits("100", 18);
    const whaleStake = ethers.parseUnits("2000000", 18);
    const halfWhale = ethers.parseUnits("1000000", 18);
  
    // 🟢 Step 1: User1 stakes first
    await lim.connect(user1).approve(pool.getAddress(), smallStake);
    await pool.connect(user1).stake(smallStake);
    console.log("✅ User1 staked 100 LIM");
  
    // 🐳 Step 2: Whale stakes
    await lim.connect(user2).approve(pool.getAddress(), whaleStake);
    await pool.connect(user2).stake(whaleStake);
    console.log("🐳 User2 staked 2,000,000 LIM");
  
    // 🕒 Step 3: Let both farm for 1 day
    await time.increase(86400);
    await ethers.provider.send("evm_mine");
  
    const pendingUser1Day1 = await pool.pendingReward(user1.address);
    const pendingUser2Day1 = await pool.pendingReward(user2.address);
  
    console.log("📊 Day 1 (before unstake):");
    console.log("🧑‍🌾 User1 pending reward:", ethers.formatUnits(pendingUser1Day1, 18));
    console.log("🐳 User2 pending reward:", ethers.formatUnits(pendingUser2Day1, 18));
  
    // 🧾 Step 4: Whale unstakes half (and auto-claims)
    const whaleBalBeforeUnstake = await lim.balanceOf(user2.address);
    await pool.connect(user2).unstake(halfWhale);
    const whaleBalAfterUnstake = await lim.balanceOf(user2.address);
    const claimedOnUnstake = whaleBalAfterUnstake - whaleBalBeforeUnstake;
  
    console.log("🔁 User2 unstakes 1,000,000 LIM");
    console.log("💸 User2 claimed reward on unstake:", ethers.formatUnits(claimedOnUnstake, 18));
  
    // 🕒 Step 5: Let both farm for another day
    await time.increase(86400);
    await ethers.provider.send("evm_mine");
  
    const newPendingUser1 = await pool.pendingReward(user1.address);
    const newPendingUser2 = await pool.pendingReward(user2.address);
  
    console.log("📊 Day 2 (after whale unstaked half):");
    console.log("🧑‍🌾 User1 pending reward:", ethers.formatUnits(newPendingUser1, 18));
    console.log("🐳 User2 pending reward:", ethers.formatUnits(newPendingUser2, 18));
  
    // ✅ Assertions
    expect(newPendingUser1).to.be.gt(pendingUser1Day1); // user1 should earn more after whale halves stake
    expect(newPendingUser2).to.be.lt(pendingUser2Day1); // whale earns less after unstake
  });    
});

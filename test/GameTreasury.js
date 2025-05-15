const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GameTreasury – Vesting & Fee Management", function () {
  async function deployFixture() {
    const [owner, user1, feeCollector, user2] = await ethers.getSigners();

    // Deploy token
    const Token = await ethers.getContractFactory("LiminalToken");
    const lim = await Token.deploy();
    await lim.waitForDeployment();

    // Deploy treasury
    const upfrontUnlocked = ethers.parseEther("5000000");
    const totalAllocation = ethers.parseEther("75000000");
    const vestingDuration = 6 * 30 * 24 * 60 * 60;       // 6 months
    const Treasury = await ethers.getContractFactory("GameTreasury");
    const treasury = await Treasury.deploy(await lim.getAddress(), totalAllocation, upfrontUnlocked, vestingDuration);
    await treasury.waitForDeployment();

    // Fund treasury with full 75M LIM
    await treasury.connect(owner).grantLoaderRole(owner.address);
    const fullAmount = ethers.parseUnits("75000000", 18);
    await lim.approve(treasury.target, fullAmount);
    await treasury.connect(owner).receiveRewardTokens(fullAmount);

    // test game fee pool
    const testGameFeeAmount = ethers.parseUnits("1000", 18);
    await lim.approve(treasury.target, testGameFeeAmount);
    await treasury.connect(owner).receiveGameFeeTokens(testGameFeeAmount);
    await treasury.connect(owner).transferGameFeeTokens(user2.address, testGameFeeAmount);

    // Grant GAME_CONTRACT_ROLE to owner for testing
    await treasury.connect(owner).grantGameContractRole(owner.address);

    return { owner, user1, feeCollector, lim, treasury };
  }

  it("should allow upfront transfer of 5M tokens", async () => {
    const { treasury, lim, owner, user1 } = await loadFixture(deployFixture);

    const upfront = ethers.parseUnits("5000000", 18);
    await expect(treasury.transferTokens(user1.address, upfront))
      .to.emit(treasury, "TokensTransferred")
      .withArgs(user1.address, upfront);

    expect(await lim.balanceOf(user1.address)).to.equal(upfront);
  });

  it("should prevent transfer beyond current releasable amount", async () => {
    const { treasury, owner, user1 } = await loadFixture(deployFixture);

    const tooMuch = ethers.parseUnits("6000000", 18); // Only 5M vested initially
    await expect(treasury.transferTokens(user1.address, tooMuch)).to.be.revertedWith("Insufficient unlocked tokens");
  });

    it("should unlock tokens linearly over 6 months", async () => {
        const { treasury } = await loadFixture(deployFixture);
        const halfVesting = 90 * 24 * 60 * 60; // 90 days

        await time.increase(halfVesting);

        const releasable = await treasury.releasable();
        const expected = ethers.parseUnits("40000000", 18); // 5M + half of remaining 70M

        const diff = releasable - expected;
        expect(diff).to.be.lessThanOrEqual(ethers.parseUnits("33", 18)); // < 0.01 LIM
    });

  it("should allow GAME_CONTRACT_ROLE to add fees", async () => {
    const { treasury, lim, owner } = await loadFixture(deployFixture);

    const token = await lim.getAddress();
    const fee = ethers.parseUnits("500", 18);

    await treasury.addGameFee(token, fee);
    await treasury.addLiquidityFee(token, fee);

    expect(await treasury.gameTreasuryFees(token)).to.equal(fee);
    expect(await treasury.liquidityPoolFees(token)).to.equal(fee);
  });

  it("should allow owner to collect fees", async () => {
    const { treasury, lim, owner, feeCollector } = await loadFixture(deployFixture);

    const token = await lim.getAddress();
    const fee = ethers.parseUnits("1000", 18);

    await treasury.addGameFee(token, fee);
    await treasury.addLiquidityFee(token, fee);

    await expect(treasury.collectGameFees(token, feeCollector.address))
      .to.emit(treasury, "FeeCollected")
      .withArgs(token, fee, "gameTreasury", feeCollector.address);

    await expect(treasury.collectLiquidityFees(token, feeCollector.address))
      .to.emit(treasury, "FeeCollected")
      .withArgs(token, fee, "liquidityPool", feeCollector.address);

    expect(await lim.balanceOf(feeCollector.address)).to.equal(fee * 2n);
  });

  it("should restrict fee collection to owner only", async () => {
    const { treasury, user1, lim } = await loadFixture(deployFixture);
    const token = await lim.getAddress();

    await expect(treasury.connect(user1).collectGameFees(token, user1.address)).to.be.reverted;
    await expect(treasury.connect(user1).collectLiquidityFees(token, user1.address)).to.be.reverted;
  });

  it("should restrict fee adding to GAME_CONTRACT_ROLE", async () => {
    const { treasury, user1, lim } = await loadFixture(deployFixture);
    const token = await lim.getAddress();
    const amt = ethers.parseUnits("100", 18);

    await expect(treasury.connect(user1).addGameFee(token, amt)).to.be.reverted;
    await expect(treasury.connect(user1).addLiquidityFee(token, amt)).to.be.reverted;
  });

    it("should allow owner to transfer full vested amount over time", async () => {
    const { treasury, lim, owner, user1 } = await loadFixture(deployFixture);

    const upfront = ethers.parseUnits("5000000", 18);
    const total = ethers.parseUnits("75000000", 18);

    // Step 1: Transfer upfront 5M
    await expect(treasury.transferTokens(user1.address, upfront))
      .to.emit(treasury, "TokensTransferred")
      .withArgs(user1.address, upfront);

    // Step 2: Fast forward 90 days (half vesting)
    await time.increase(90 * 24 * 60 * 60);
    const halfUnlocked = await treasury.releasable();

    await expect(treasury.transferTokens(user1.address, halfUnlocked))
      .to.emit(treasury, "TokensTransferred")
      .withArgs(user1.address, halfUnlocked);

    // Step 3: Fast forward another 90 days (full vesting)
    await time.increase(90 * 24 * 60 * 60);
    const finalUnlocked = await treasury.releasable();

    await expect(treasury.transferTokens(user1.address, finalUnlocked))
      .to.emit(treasury, "TokensTransferred")
      .withArgs(user1.address, finalUnlocked);

    // Final check: user should have 75M LIM
    const userBalance = await lim.balanceOf(user1.address);
    expect(userBalance).to.equal(total);
  });

});

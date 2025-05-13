const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LongTermReserve", function () {
  async function deployFixture() {
    const [deployer, controller, attacker] = await ethers.getSigners();

    const LiminalToken = await ethers.getContractFactory("LiminalToken");
    const token = await LiminalToken.deploy();
    await token.waitForDeployment();

    const LongTermReserve = await ethers.getContractFactory("LongTermReserve");
    const upfront = ethers.parseEther("10000000"); // 10M
    const total = ethers.parseEther("30000000");   // 30M
    const cliff = 30 * 24 * 60 * 60;               // 1 month
    const duration = 3 * 30 * 24 * 60 * 60;       // 3 months

    const reserve = await LongTermReserve.deploy(
      token.target,
      controller.address,
      upfront,
      total,
      cliff,
      duration
    );
    await reserve.waitForDeployment();

    // Fund the reserve with the full 30M LIM
    await token.transfer(reserve.target, total);

    return { deployer, controller, attacker, token, reserve, upfront, total, cliff, duration };
  }

  it("should release upfront tokens only after cliff and manual call", async function () {
    const { token, controller, reserve, upfront, total, cliff } = await loadFixture(deployFixture);

    // Contract should hold all tokens
    expect(await token.balanceOf(reserve.target)).to.equal(total);
    expect(await token.balanceOf(controller.address)).to.equal(0);

    // Move time forward past the cliff
    await time.increase(cliff + 86400);
    await ethers.provider.send("evm_mine");

    const releasable = await reserve.releasable();
    console.log(`releasable : ${releasable}`);

    // Release the upfront tokens
    await reserve.connect(controller).release(upfront);

    // Controller should now have the upfront amount
    expect(await token.balanceOf(controller.address)).to.equal(upfront);

    // Reserve contract should hold the rest
    expect(await token.balanceOf(reserve.target)).to.equal(total - upfront);
  });

  it("should not allow release before cliff", async function () {
    const { reserve, controller } = await loadFixture(deployFixture);
    await expect(reserve.connect(controller).release(1)).to.be.revertedWith("Invalid release amount");
  });

  it("should allow partial release after cliff and time passed", async function () {
    const { reserve, token, controller, upfront, total, cliff, duration } = await loadFixture(deployFixture);

    await time.increase(cliff + duration / 2);

    const releasable = await reserve.releasable();
    const partial = releasable / 2n;

    await expect(reserve.connect(controller).release(partial)).to.changeTokenBalances(
      token,
      [reserve, controller],
      [-partial, partial]
    );
  });

  it("should not allow anyone but the controller to release", async function () {
    const { reserve, attacker, cliff } = await loadFixture(deployFixture);
    await time.increase(cliff);
    await expect(reserve.connect(attacker).release(1)).to.be.revertedWith("Not authorized");
  });

  it("should not allow releasing more than available", async function () {
    const { reserve, controller, cliff, duration } = await loadFixture(deployFixture);
    await time.increase(cliff + duration);

    const releasable = await reserve.releasable();
    await expect(reserve.connect(controller).release(releasable + 1n)).to.be.revertedWith("Invalid release amount");
  });

  it("should allow full release at the end of vesting", async function () {
    const { reserve, token, controller, total, cliff, duration } = await loadFixture(deployFixture);
    await time.increase(cliff + duration);

    const releasable = await reserve.releasable();
    await expect(reserve.connect(controller).release(releasable)).to.changeTokenBalances(
      token,
      [reserve, controller],
      [-releasable, releasable]
    );

    expect(await token.balanceOf(controller.address)).to.equal(total);
  });
});

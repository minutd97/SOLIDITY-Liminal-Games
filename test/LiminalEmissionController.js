const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

function toUnits(amount) {
  return BigInt(ethers.parseUnits(amount.toString(), 18));
}

describe("LiminalEmissionController", function () {
  async function deployFixture() {
    const [owner, user1] = await ethers.getSigners();

    const LIM = await ethers.getContractFactory("LiminalToken");
    const lim = await LIM.deploy();
    await lim.waitForDeployment();

    const Pool = await ethers.getContractFactory("LiminalStakingPool");
    const pool = await Pool.deploy(await lim.getAddress());
    await pool.waitForDeployment();

    const Controller = await ethers.getContractFactory("LiminalEmissionController");
    const controller = await Controller.deploy(await lim.getAddress(), await pool.getAddress());
    await controller.waitForDeployment();

    //Grand loader role to owner
    await pool.connect(owner).grantLoaderRole(owner.address);

    //Grand loader role to controller
    await pool.connect(owner).grantLoaderRole(controller.getAddress());

    // Fund the controller with 160M LIM
    const fundAmount = toUnits(160_000_000);
    await lim.connect(owner).transfer(await controller.getAddress(), fundAmount);

    return { owner, user1, lim, pool, controller };
  }

  it("should emit monthly reward if time passed", async function () {
    const { controller, pool, lim, owner } = await loadFixture(deployFixture);
    await time.increase(365 * 24 * 60 * 60); // Fast forward 1 year

    const balBefore = await lim.balanceOf(await pool.getAddress());
    expect(balBefore).to.equal(0n);

    await controller.connect(owner).emitMonthlyReward();

    const expectedAmount = toUnits(5_000_000);
    const poolBalance = await lim.balanceOf(await pool.getAddress());
    console.log("Pool received:", ethers.formatUnits(poolBalance));
    expect(poolBalance).to.equal(expectedAmount);

    const emitted = await controller.totalEmitted();
    console.log("Total emitted:", ethers.formatUnits(emitted));
    expect(emitted).to.equal(expectedAmount);
  });

  it("should not allow emission before 30 days", async function () {
    const { controller, owner } = await loadFixture(deployFixture);
    await time.increase(365 * 24 * 60 * 60); // Fast forward 1 year

    await controller.connect(owner).emitMonthlyReward();
    await expect(controller.connect(owner).emitMonthlyReward()).to.be.revertedWith("Emission not ready");
  });

  it("should respect TOTAL_EMISSION_CAP", async function () {
    const { controller, owner } = await loadFixture(deployFixture);
    
    await time.increase(365 * 24 * 60 * 60); // Fast forward 1 year
    const maxEmissions = 32; // 160M / 5M = 32 months
    for (let i = 0; i < maxEmissions; i++) {
      await controller.connect(owner).emitMonthlyReward();
      await time.increase(30 * 24 * 60 * 60);
    }

    //await time.increase(30 * 24 * 60 * 60);
    await expect(controller.connect(owner).emitMonthlyReward()).to.be.revertedWith("Emission cap exceeded");
  });

  it("should expose correct LIM balance and remaining emission", async function () {
    const { controller } = await loadFixture(deployFixture);
    const balance = await controller.getLIMBalance();
    const remaining = await controller.getRemainingEmission();

    console.log("Controller LIM balance:", ethers.formatUnits(balance));
    console.log("Remaining emission cap:", ethers.formatUnits(remaining));

    expect(balance).to.equal(toUnits(160_000_000));
    expect(remaining).to.equal(toUnits(160_000_000));
  });
});

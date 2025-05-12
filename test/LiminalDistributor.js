const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LiminalDistributor", function () {
  async function deployFixture() {
    const [owner, gameTreasury, staking, lpStaking, governor, outsider] = await ethers.getSigners();

    // Deploy LIM token
    const LIM = await ethers.getContractFactory("LiminalToken");
    const lim = await LIM.deploy();
    await lim.waitForDeployment();

    // Mint 230M LIM to distributor
    const totalAmount = ethers.parseEther("230000000"); // 230M
    const Distributor = await ethers.getContractFactory("LiminalDistributor");
    const distributor = await Distributor.deploy(lim.target);
    await distributor.waitForDeployment();
    console.log(`LiminalDistributor : ${distributor.target}`);

    await lim.transfer(distributor.target, totalAmount);

    // Deploy treasury
    const Treasury = await ethers.getContractFactory("GameTreasury");
    const treasury = await Treasury.deploy(await lim.getAddress());
    await treasury.waitForDeployment();
    console.log(`GameTreasury : ${treasury.target}`);

    // Deploy LPStakingRewards
    const LPStakingRewards = await ethers.getContractFactory("LPStakingRewards");
    const lpStakingRewards = await LPStakingRewards.deploy(lim.target, "0xd88f38f930b7952f2db2432cb002e7abbf3dd869");
    await lpStakingRewards.waitForDeployment();
    console.log(`LPStakingRewards : ${lpStakingRewards.target}`);

    // Deploy staking pool
    const LiminalStakingPool = await ethers.getContractFactory("LiminalStakingPool");
    const liminalStakingPool = await LiminalStakingPool.deploy(await lim.getAddress());
    await liminalStakingPool.waitForDeployment();
    console.log(`LiminalStakingPool : ${liminalStakingPool.target}`);

    //Grant pool loader roles
    await treasury.connect(owner).grantLoaderRole(distributor.target);
    await lpStakingRewards.connect(owner).grantLoaderRole(distributor.target);
    await liminalStakingPool.connect(owner).grantLoaderRole(distributor.target);

    return {owner, outsider, lim, distributor, treasury, liminalStakingPool, lpStakingRewards};
  }

  it("should distribute to all targets exactly once", async function () {
    const {owner, outsider, lim, distributor, treasury, liminalStakingPool, lpStakingRewards} = await loadFixture(deployFixture);

    // Set contract targets
    await distributor.setGameTreasury(treasury.target);
    await distributor.setLiminalStaking(liminalStakingPool.target);
    await distributor.setLPStaking(lpStakingRewards.target);

    // Execute all 4 distributions
    await expect(distributor.distributeToGameTreasury())
      .to.emit(lim, "Transfer")
      .withArgs(distributor.target, treasury.target, ethers.parseEther("75000000"));

    await expect(distributor.distributeToLiminalStaking())
      .to.emit(lim, "Transfer")
      .withArgs(distributor.target, liminalStakingPool.target, ethers.parseEther("80000000"));

    await expect(distributor.distributeToLPStaking())
      .to.emit(lim, "Transfer")
      .withArgs(distributor.target, lpStakingRewards.target, ethers.parseEther("45000000"));

    // Attempting a second distribution should fail
    await expect(distributor.distributeToGameTreasury()).to.be.revertedWith("Already distributed");
    await expect(distributor.distributeToLiminalStaking()).to.be.revertedWith("Already distributed");
    await expect(distributor.distributeToLPStaking()).to.be.revertedWith("Already distributed");
  });

  it("should revert if contract address is not set", async function () {
    const { distributor } = await loadFixture(deployFixture);
    await expect(distributor.distributeToGameTreasury()).to.be.revertedWith("Target not set");
  });

  it("should only allow owner to set target contracts", async function () {
    const { distributor, outsider } = await loadFixture(deployFixture);
    await expect(
        distributor.connect(outsider).setGameTreasury(outsider.address)
        ).to.be.revertedWithCustomError(distributor, "OwnableUnauthorizedAccount");
  });
});

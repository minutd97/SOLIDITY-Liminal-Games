const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FullTeamVesting", function () {
  async function deployFixture() {
    const [deployer, beneficiary1, beneficiary2] = await ethers.getSigners();

    const LiminalToken = await ethers.getContractFactory("LiminalToken");
    const token = await LiminalToken.deploy();
    await token.waitForDeployment();

    const Controller = await ethers.getContractFactory("TeamVestingController");
    const controller = await Controller.deploy();
    await controller.waitForDeployment();

    const Vault = await ethers.getContractFactory("TeamVestingVault");
    const vault = await Vault.deploy(await controller.getAddress());
    await vault.waitForDeployment();

    // Grant funder role for vault and deployer
    await controller.grantFunderRole(await vault.getAddress());
    await controller.grantFunderRole(deployer.address);

    return { deployer, beneficiary1, beneficiary2, token, vault, controller };
  }

  it("should run full vesting lifecycle for multiple beneficiaries with LiminalToken", async function () {
    const { deployer, beneficiary1, beneficiary2, token, vault, controller } = await loadFixture(deployFixture);

    const start = await time.latest();
    const cliff = 30 * 24 * 60 * 60; // 1 month
    const duration = 365 * 24 * 60 * 60; // 12 months

    for (const beneficiary of [beneficiary1, beneficiary2]) {
      console.log("\nCreating vesting wallet for:", beneficiary.address);
      const tx = await controller.createVestingWallet(
        beneficiary.address,
        start,
        duration,
        cliff,
        vault.target
      );
      await tx.wait();

      console.log("Funding wallet with $LIM and ETH...");
      await token.approve(controller.target, ethers.parseEther("1000"));
      await controller.fundERC20ToWallet(beneficiary.address, token.target, ethers.parseEther("1000"));
      await controller.fundETHToWallet(beneficiary.address, { value: ethers.parseEther("10") });
    }

    console.log("\n⏩ Advancing time to halfway through vesting period after cliff...");
    const halfVestingAfterCliff = cliff + (duration - cliff) / 2;
    await time.increase(halfVestingAfterCliff);

    for (const beneficiary of [beneficiary1, beneficiary2]) {
      console.log("\nReleasing vested assets for:", beneficiary.address);
      await controller.releaseVestedERC20(beneficiary.address, await token.getAddress());
      await controller.releaseVestedETH(beneficiary.address);

      console.log("Revoking vesting wallet...");
      await controller.revokeVesting(beneficiary.address);

      console.log("Reclaiming unvested assets...");
      await controller.reclaimUnvestedERC20(beneficiary.address, await token.getAddress());
      await controller.reclaimUnvestedETH(beneficiary.address);
    }

    console.log("\n⚙️ Setting vault release rates...");
    await vault.setERC20ReleaseRate(await token.getAddress(), ethers.parseEther("100"));
    await vault.setETHReleaseRate(ethers.parseEther("1"));

    for (const beneficiary of [beneficiary1, beneficiary2]) {
      console.log("\nVault releasing to:", beneficiary.address);
      await vault.releaseTokensTo(beneficiary.address, await token.getAddress(), ethers.parseEther("100"));
      await vault.releaseETHTo(beneficiary.address, ethers.parseEther("1"));

      const vestingWallet = await controller.getVestingWallet(beneficiary.address);
      const balLIM = await token.balanceOf(vestingWallet);
      const balETH = await ethers.provider.getBalance(vestingWallet);

      console.log("Vesting Wallet:", vestingWallet);
      console.log("Final $LIM Balance:", ethers.formatEther(balLIM));
      console.log("Final ETH Balance:", ethers.formatEther(balETH));

      expect(balLIM).to.be.gt(0);
      expect(balETH).to.be.gt(0);
    }
  });
});

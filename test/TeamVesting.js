const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FullTeamVesting", function () {
  async function deployFixture() {
    const [deployer, beneficiary1, beneficiary2, attacker] = await ethers.getSigners();

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

    console.log("\n⚙️ Setting vault release rates...");
    await vault.setERC20ReleaseRate(await token.getAddress(), ethers.parseEther("100"));
    await vault.setETHReleaseRate(ethers.parseEther("1"));

    return { deployer, beneficiary1, beneficiary2, attacker, token, vault, controller };
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
      const walletAddr = await controller.getVestingWallet(beneficiary.address);
      const vestingWallet = await ethers.getContractAt("TeamVestingWallet", walletAddr);

      const releasableTokens = await controller.releasableAmountERC20(beneficiary.address, await token.getAddress());
      const releasableETH = await controller.releasableETH(beneficiary.address);

      console.log("\nVesting status for:", beneficiary.address);
      console.log("Releasable $LIM:", ethers.formatEther(releasableTokens));
      console.log("Releasable ETH:", ethers.formatEther(releasableETH));

      console.log("Releasing vested assets...");
      await controller.releaseVestedERC20(beneficiary.address, await token.getAddress());
      await controller.releaseVestedETH(beneficiary.address);

      console.log("Revoking vesting wallet...");
      await controller.revokeVesting(beneficiary.address);

      console.log("Reclaiming unvested assets...");
      await controller.reclaimUnvestedERC20(beneficiary.address, await token.getAddress());
      await controller.reclaimUnvestedETH(beneficiary.address);
    }

    console.log("\n🔍 Vault stats before release:");
    const releasableLIM = await vault.releasableTokenAmount(await token.getAddress());
    const releasableETH = await vault.releasableETHAmount();
    console.log("Releasable LIM from Vault:", ethers.formatEther(releasableLIM));
    console.log("Releasable ETH from Vault:", ethers.formatEther(releasableETH));

    for (const beneficiary of [beneficiary1, beneficiary2]) {
      console.log("\nVault releasing to:", beneficiary.address);
      await vault.releaseTokensTo(beneficiary.address, await token.getAddress(), ethers.parseEther("100"));
      await vault.releaseETHTo(beneficiary.address, ethers.parseEther("1"));

      const walletAddr = await controller.getVestingWallet(beneficiary.address);
      const balLIM = await token.balanceOf(walletAddr);
      const balETH = await ethers.provider.getBalance(walletAddr);

      console.log("Vesting Wallet:", walletAddr);
      console.log("Final $LIM Balance:", ethers.formatEther(balLIM));
      console.log("Final ETH Balance:", ethers.formatEther(balETH));

      expect(balLIM).to.be.gt(0);
      expect(balETH).to.be.gt(0);
    }

    const remainingLIM = await vault.remainingTokenBalance(await token.getAddress());
    const remainingETH = await vault.remainingETHBalance();
    console.log("Remaining LIM from Vault:", ethers.formatEther(remainingLIM));
    console.log("Remaining ETH from Vault:", ethers.formatEther(remainingETH));
  });

  it("should reject unauthorized access to restricted functions", async function () {
    const { controller, vault, attacker, beneficiary1, token } = await loadFixture(deployFixture);

    console.log("\n🚨 Testing unauthorized actions from attacker address:");
    const controllerAsAttacker = controller.connect(await ethers.getSigner(attacker.address));
    const vaultAsAttacker = vault.connect(await ethers.getSigner(attacker.address));

    await expect(
      controllerAsAttacker.fundETHToWallet(beneficiary1.address)
    ).to.be.revertedWithCustomError(controller, "AccessControlUnauthorizedAccount");

    await expect(
      controllerAsAttacker.revokeVesting(beneficiary1.address)
    ).to.be.revertedWithCustomError(controller, "OwnableUnauthorizedAccount");

    await expect(
      controllerAsAttacker.reclaimUnvestedERC20(beneficiary1.address, token.target)
    ).to.be.revertedWithCustomError(controller, "OwnableUnauthorizedAccount");

    await expect(
      controllerAsAttacker.reclaimUnvestedETH(beneficiary1.address)
    ).to.be.revertedWithCustomError(controller, "OwnableUnauthorizedAccount");

    await expect(
      vaultAsAttacker.setERC20ReleaseRate(token.target, ethers.parseEther("999"))
    ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");

    await expect(
      vaultAsAttacker.releaseTokensTo(beneficiary1.address, token.target, ethers.parseEther("999"))
    ).to.be.reverted;

    await expect(
      vaultAsAttacker.releaseETHTo(beneficiary1.address, ethers.parseEther("999"))
    ).to.be.reverted;
  });
});

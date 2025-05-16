const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FullTeamVesting", function () {
  async function deployFixture() {
    const [deployer, beneficiary1, beneficiary2, beneficiary3, attacker] = await ethers.getSigners();

    const LiminalToken = await ethers.getContractFactory("LiminalToken");
    const token = await LiminalToken.deploy();
    await token.waitForDeployment();

    const Controller = await ethers.getContractFactory("TeamVestingController");
    const controller = await Controller.deploy();
    await controller.waitForDeployment();

    const Vault = await ethers.getContractFactory("TeamVestingVault");
    const vault = await Vault.deploy(await controller.getAddress());
    await vault.waitForDeployment();

    // Set vault address
    await controller.connect(deployer).setVaultAddress(vault.target);

    // Grant funder role for vault and deployer
    await controller.grantFunderRole(await vault.getAddress());
    await controller.grantFunderRole(deployer.address);

    console.log("\n⚙️ Setting vault release rates...");

    const vesting_vault_reserve_upfront = ethers.parseEther("10000000"); // 10M
    const vesting_vault_reserve = ethers.parseEther("30000000"); // 30M
    const secondsInYear = 365 * 24 * 60 * 60;
    const ratePerSecond = vesting_vault_reserve / BigInt(secondsInYear);

    await vault.setERC20ReleaseRate(await token.getAddress(), ratePerSecond, vesting_vault_reserve_upfront);
    await vault.setETHReleaseRate(ethers.parseEther("0.000001"), ethers.parseEther("100"));

    // Fund vault with LIM and ETH so it can release to vesting wallets
    await token.approve(await vault.getAddress(), vesting_vault_reserve + vesting_vault_reserve_upfront) // 40M LIM
    await token.transfer(await vault.getAddress(), vesting_vault_reserve + vesting_vault_reserve_upfront); // 40M LIM
    await deployer.sendTransaction({
      to: await vault.getAddress(),
      value: ethers.parseEther("200") // 200 ETH
    });

    return { deployer, beneficiary1, beneficiary2, beneficiary3, attacker, token, vault, controller };
  }

  it("should fully release vault tokens after a one year period", async function () {
    const { deployer, beneficiary1, beneficiary2, beneficiary3, token, vault, controller } = await loadFixture(deployFixture);
    const upfrontLIM = await vault.releasableTokenAmount(await token.getAddress());
    const upfrontETH = await vault.releasableETHAmount();
    console.log("🔓 Upfront unlocked LIM:", ethers.formatEther(upfrontLIM));
    console.log("🔓 Upfront unlocked ETH:", ethers.formatEther(upfrontETH));

    const releasableLIM = await vault.releasableTokenAmount(await token.getAddress());
    console.log("Releasable LIM from Vault:", ethers.formatEther(releasableLIM));

    //const start = await time.latest();
    const duration = 365 * 24 * 60 * 60; // 12 months
    await time.increase(duration);

    const releasableLIM2 = await vault.releasableTokenAmount(await token.getAddress());
    console.log("Releasable LIM from Vault:", ethers.formatEther(releasableLIM2));
  });

  it("should run full vesting lifecycle for multiple beneficiaries with LiminalToken", async function () {
    const { deployer, beneficiary1, beneficiary2, beneficiary3, token, vault, controller } = await loadFixture(deployFixture);

    const upfrontLIM = await vault.releasableTokenAmount(await token.getAddress());
    const upfrontETH = await vault.releasableETHAmount();
    console.log("🔓 Upfront unlocked LIM:", ethers.formatEther(upfrontLIM));
    console.log("🔓 Upfront unlocked ETH:", ethers.formatEther(upfrontETH));

    const start = await time.latest();
    const cliff = 30 * 24 * 60 * 60; // 1 month
    const duration = 365 * 24 * 60 * 60; // 12 months

    for (const beneficiary of [beneficiary1, beneficiary2]) {
      console.log("\nCreating vesting wallet for:", beneficiary.address);
      const tx = await controller.createVestingWallet(
        beneficiary.address,
        duration,
        cliff
      );
      await tx.wait();

      console.log("Funding wallet with $LIM...");
      await token.approve(controller.target, ethers.parseEther("1000"));
      await controller.fundERC20ToWallet(beneficiary.address, token.target, ethers.parseEther("1000"));
    }

    console.log("\n⏩ Advancing time to halfway through vesting period after cliff...");
    const halfVestingAfterCliff = cliff + (duration / 2);
    await time.increase(halfVestingAfterCliff);

    for (const beneficiary of [beneficiary1, beneficiary2]) {
      //const walletAddr = await controller.getVestingWallet(beneficiary.address);
      //const vestingWallet = await ethers.getContractAt("TeamVestingWallet", walletAddr);

      const releasableTokens = await controller.releasableAmountERC20(beneficiary.address, await token.getAddress());

      console.log("\nVesting status for:", beneficiary.address);
      console.log("Releasable $LIM:", ethers.formatEther(releasableTokens));

      console.log("Releasing vested assets...");
      await controller.releaseVestedERC20(beneficiary.address, await token.getAddress());

      console.log("Revoking vesting wallet...");
      await controller.revokeVesting(beneficiary.address);

      console.log("Reclaiming unvested assets...");
      await controller.reclaimUnvestedERC20(beneficiary.address, await token.getAddress());
    }

    console.log("\n🔍 Vault stats before release:");
    const releasableLIM = await vault.releasableTokenAmount(await token.getAddress());
    const releasableETH = await vault.releasableETHAmount();
    console.log("Releasable LIM from Vault:", ethers.formatEther(releasableLIM));
    console.log("Releasable ETH from Vault:", ethers.formatEther(releasableETH));

    console.log("\nCreating vesting wallet for:", beneficiary3.address);
      const tx = await controller.createVestingWallet(
        beneficiary3.address,
        duration,
        cliff
      );
    await tx.wait();

    console.log("\nVault releasing to:", beneficiary3.address);
    await vault.releaseTokensTo(beneficiary3.address, await token.getAddress(), ethers.parseEther("1000000"));

    const walletAddr = await controller.getVestingWallet(beneficiary3.address);
    const balLIM = await token.balanceOf(walletAddr);

    console.log("Vesting Wallet:", walletAddr);
    console.log("Final $LIM Balance:", ethers.formatEther(balLIM));

    expect(balLIM).to.be.gt(0);

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
      vaultAsAttacker.setERC20ReleaseRate(token.target, ethers.parseEther("999"), ethers.parseEther("999"))
    ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");

    await expect(
      vaultAsAttacker.releaseTokensTo(beneficiary1.address, token.target, ethers.parseEther("999"))
    ).to.be.reverted;

    await expect(
      vaultAsAttacker.releaseETHTo(beneficiary1.address, ethers.parseEther("999"))
    ).to.be.reverted;
  });
});

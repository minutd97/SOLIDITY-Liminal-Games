const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

function toUnits(amount) {
  return ethers.parseUnits(amount.toString(), 18);
}

describe("TeamVesting", function () {
  async function deployFixture() {
    const [owner, user1] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("LiminalToken");
    const token = await Token.deploy();
    await token.waitForDeployment();

    const Manager = await ethers.getContractFactory("TeamVestingController");
    const manager = await Manager.deploy();
    await manager.waitForDeployment();

    const Vault = await ethers.getContractFactory("TeamVestingVault");
    const vault = await Vault.deploy(manager.target);
    await vault.waitForDeployment();

    const now = Math.floor(Date.now() / 1000);
    const cliff = 30 * 24 * 60 * 60;
    const duration = 365 * 24 * 60 * 60;

    const vestingAmount = toUnits(100_000);
    const ethAmount = ethers.parseEther("10");

    // Setup roles and vesting
    await manager.grantFunderRole(owner.address);
    await manager.grantFunderRole(vault.target);
    await manager.createVestingWallet(user1.address, now, duration, cliff, vault.target);

    const vestingWalletAddr = await manager.getVestingWallet(user1.address);

    // Fund vesting wallet directly (simulate custom funding)
    await token.approve(manager.getAddress(), vestingAmount);
    await manager.fundERC20ToWallet(user1.address, token.getAddress(), vestingAmount);
    await manager.fundETHToWallet(user1.address, { value: ethAmount });

    // Fund vault with new tokens to release later
    const vaultLockedAmount = toUnits(50_000);
    await token.transfer(vault.target, vaultLockedAmount);
    await vault.setTokenReleaseRate(token.getAddress(), toUnits(1)); // 1 token/sec

    await vault.setETHReleaseRate(ethers.parseEther("0.5")); // 0.5 ETH/sec
    await owner.sendTransaction({ to: vault.target, value: ethers.parseEther("10") });

    return { owner, user1, token, manager, vestingWalletAddr, vestingAmount, ethAmount, now, duration, cliff, vault, vaultLockedAmount };
  }

  it("should support full vesting flow: release, revoke, vault logic", async function () {
    const { user1, token, manager, vestingWalletAddr, vestingAmount, ethAmount, now, duration, cliff, vault, vaultLockedAmount } = await loadFixture(deployFixture);

    // Confirm wallet setup
    const wallet = await manager.getVestingWallet(user1.address);
    expect(wallet).to.equal(vestingWalletAddr);

    // Releasable before cliff = 0
    await time.increaseTo(now + cliff - 10);
    expect(await manager.releasableAmountERC20(user1.address, token.getAddress())).to.equal(0n);
    expect(await manager.releasableETH(user1.address)).to.equal(0n);

    // After 6 months
    const sixMonths = BigInt(duration) / 2n;
    await time.increaseTo(now + cliff + Number(sixMonths));

    // Check and release ERC20
    const expectedTokens = (vestingAmount * sixMonths) / BigInt(duration);
    const releasableTokens = await manager.releasableAmountERC20(user1.address, token.getAddress());
    expect(releasableTokens).to.equal(expectedTokens);

    await manager.releaseVestedERC20(user1.address, token.getAddress());

    // Check and release ETH
    const expectedETH = (ethAmount * sixMonths) / BigInt(duration);
    const releasableETH = await manager.releasableETH(user1.address);
    expect(releasableETH).to.be.closeTo(expectedETH, ethers.parseEther("0.001"));

    const balanceBeforeETH = await ethers.provider.getBalance(user1.address);
    const tx = await manager.connect(user1).releaseVestedETH(user1.address);
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * receipt.gasPrice;
    const balanceAfterETH = await ethers.provider.getBalance(user1.address);
    const receivedETH = balanceAfterETH - balanceBeforeETH + gas;
    expect(receivedETH).to.be.closeTo(releasableETH, ethers.parseEther("0.001"));

    // Revoke the wallet
    await manager.revokeVesting(user1.address);

    // Attempt to release again later — should stay frozen
    await time.increase(60 * 60 * 24 * 30); // +1 month
    expect(await manager.releasableAmountERC20(user1.address, token.getAddress())).to.equal(0n);

    // Fund vault → release rate-limited ERC20
    await time.increase(100); // wait 100 seconds
    const releasableFromVault = await vault.releasableTokenAmount(token.getAddress());
    expect(releasableFromVault).to.equal(toUnits(100));

    await vault.releaseTokensTo(user1.address, token.getAddress(), toUnits(100));

    // Rate-limited ETH release
    const releasableETHFromVault = await vault.releasableETHAmount();
    expect(releasableETHFromVault).to.be.closeTo(ethers.parseEther("50"), ethers.parseEther("0.5"));

    await vault.releaseETHTo(user1.address, releasableETHFromVault);
  });

  it("should allow revoked wallet to return unvested tokens and ETH to the vault", async function () {
    const { user1, token, manager, vestingWalletAddr, vault, now, duration, cliff } = await loadFixture(deployFixture);
  
    const wallet = await ethers.getContractAt("TeamVestingWallet", vestingWalletAddr);
    const vaultERC20Before = await token.balanceOf(vault.target);
    const vaultETHBefore = await ethers.provider.getBalance(vault.target);
  
    // Simulate partial vesting
    await time.increaseTo(now + cliff + Number(duration / 4)); // 3 months in
  
    // Revoke the wallet
    await manager.revokeVesting(user1.address);
  
    // Fetch releasable (vested) amounts
    const releasableToken = await wallet.releasable(token.getAddress());
    const releasableETH = await wallet.releasable();
  
    // Release vested amounts to user
    await manager.releaseVestedERC20(user1.address, token.getAddress());
    await manager.connect(user1).releaseVestedETH(user1.address);
  
    // Fund vault with leftovers
    await wallet.fundVaultWithLeftoverERC20(token.getAddress());
    await wallet.fundVaultWithLeftoverETH();
  
    // Check new balances
    const vaultERC20After = await token.balanceOf(vault.target);
    const vaultETHAfter = await ethers.provider.getBalance(vault.target);
  
    // Should increase by unvested amount
    const totalWalletTokens = releasableToken + (vaultERC20After - vaultERC20Before);
    const totalWalletETH = releasableETH + (vaultETHAfter - vaultETHBefore);
  
    expect(totalWalletTokens).to.be.closeTo(toUnits(100_000), toUnits(0.01));
    expect(totalWalletETH).to.be.closeTo(ethers.parseEther("10"), ethers.parseEther("0.01"));
  });  
});

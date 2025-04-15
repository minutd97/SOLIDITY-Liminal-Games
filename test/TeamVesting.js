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

    const now = Math.floor(Date.now() / 1000);
    const cliff = 30 * 24 * 60 * 60;
    const duration = 365 * 24 * 60 * 60;

    const Vault = await ethers.getContractFactory("TeamVestingVault");
    const vault = await Vault.deploy(manager.target, token.target, now + duration + cliff);
    await vault.waitForDeployment();

    const vaultLockedAmount = toUnits(100_000);
    await token.approve(vault.target, vaultLockedAmount);
    await token.transfer(vault.target, vaultLockedAmount);

    //Grant roles
    await manager.grantFunderRole(owner.address);
    await manager.grantFunderRole(vault.target);

    await manager.createVestingWallet(user1.address, now, duration, cliff);
    const vestingWalletAddr = await manager.getVestingWallet(user1.address);

    const vestingAmount = toUnits(100_000);
    await token.approve(manager.getAddress(), vestingAmount);
    await manager.fundERC20ToWallet(user1.address, token.getAddress(), vestingAmount);

    const ethAmount = ethers.parseEther("10");
    await manager.fundETHToWallet(user1.address, { value: ethAmount });

    return { owner, user1, token, manager, vestingWalletAddr, vestingAmount, ethAmount, now, duration, cliff, vault };
  }

  it("should correctly handle ERC20 + ETH vesting and support all public functions", async function () {
    const { user1, token, manager, vestingWalletAddr, vestingAmount, ethAmount, now, duration, cliff, vault } = await loadFixture(deployFixture);

    // ✅ Validate that the vesting wallet was created and stored properly
    const wallets = await manager.getAllVestingWallets();
    expect(wallets.length).to.equal(1);
    expect(wallets[0]).to.equal(vestingWalletAddr);

    const walletFromGetter = await manager.getVestingWallet(user1.address);
    expect(walletFromGetter).to.equal(vestingWalletAddr);

    // ⏱️ Advance time to just before the cliff ends
    await time.increaseTo(now + cliff - 1);

    // 📦 Check how much is releasable just before the cliff — should be 0
    let erc20Releasable = await manager.releasableAmountERC20(user1.address, await token.getAddress());
    let ethReleasable = await manager.releasableETH(user1.address);
    expect(erc20Releasable).to.equal(0n);
    expect(ethReleasable).to.equal(0n);

    // ⏱️ Jump to halfway through the vesting duration
    const sixMonths = BigInt(duration) / 2n;
    await time.increaseTo(now + cliff + Number(sixMonths));

    // ✅ Calculate expected ERC20 tokens released (linear formula)
    const expectedERC20 = (vestingAmount * sixMonths) / BigInt(duration);
    erc20Releasable = await manager.releasableAmountERC20(user1.address, await token.getAddress());
    console.log("ERC20 Expected:", expectedERC20.toString());
    console.log("ERC20 Releasable:", erc20Releasable.toString());
    expect(erc20Releasable).to.equal(expectedERC20);

    // 💸 Release ERC20 tokens and confirm balance increased correctly
    const balanceBeforeERC20 = await token.balanceOf(user1.address);
    await manager.releaseVestedTokensERC20(user1.address, await token.getAddress());
    const balanceAfterERC20 = await token.balanceOf(user1.address);
    const releasedERC20 = balanceAfterERC20 - balanceBeforeERC20;
    expect(releasedERC20).to.be.closeTo(expectedERC20, ethers.parseUnits("0.01", 18));
    console.log("ERC20 Released:", ethers.formatUnits(releasedERC20));

    // ✅ Calculate expected ETH released (same logic as ERC20)
    const expectedETH = (ethAmount * sixMonths) / BigInt(duration);
    ethReleasable = await manager.releasableETH(user1.address);
    console.log("ETH Expected:", ethers.formatEther(expectedETH));
    console.log("ETH Releasable:", ethers.formatEther(ethReleasable));
    expect(ethReleasable).to.be.closeTo(expectedETH, ethers.parseEther("0.001"));

    // 💸 Release ETH and account for gas cost in net balance change
    const balanceBeforeETH = await ethers.provider.getBalance(user1.address);
    const tx = await manager.connect(user1).releaseVestedETH(user1.address);
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed * receipt.gasPrice;

    const balanceAfterETH = await ethers.provider.getBalance(user1.address);
    const releasedETH = balanceAfterETH - balanceBeforeETH + gasUsed;

    console.log("ETH Released:", ethers.formatEther(releasedETH));
    expect(releasedETH).to.be.closeTo(expectedETH, ethers.parseEther("0.001"));

    // ⏱️ Jump to right before we can releaseTokensTo from Team Vesting Vault
    await time.increaseTo(now + duration + cliff - 2);
    await expect(vault.releaseTokensTo(user1.address, ethers.parseUnits("100000", 18))).to.be.revertedWith("Tokens not unlocked yet");

    // ⏱️ Jump to releaseTokensTo from Team Vesting Vault
    await time.increaseTo(now + duration + cliff);
    await vault.releaseTokensTo(user1.address, ethers.parseUnits("100000", 18));
    const remainingVaultBalance = await vault.remainingTokenBalance();
    expect(remainingVaultBalance).to.equal(0n);
  });
});

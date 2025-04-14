const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

function toUnits(amount) {
  return ethers.parseUnits(amount.toString(), 18);
}

describe("TeamVestingManager", function () {
  async function deployFixture() {
    const [owner, user1] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("LiminalToken");
    const token = await Token.deploy();
    await token.waitForDeployment();

    const Manager = await ethers.getContractFactory("TeamVestingManager");
    const manager = await Manager.deploy();
    await manager.waitForDeployment();

    const now = Math.floor(Date.now() / 1000);
    const cliff = 30 * 24 * 60 * 60;
    const duration = 365 * 24 * 60 * 60;

    await manager.createVestingWallet(user1.address, now, duration, cliff);
    const vestingWalletAddr = await manager.getVestingWallet(user1.address);

    const vestingAmount = toUnits(100_000);
    await token.approve(manager.getAddress(), vestingAmount);
    await manager.fundERC20ToWallet(user1.address, token.getAddress(), vestingAmount);

    const ethAmount = ethers.parseEther("10");
    await manager.fundETHToWallet(user1.address, { value: ethAmount });

    return { owner, user1, token, manager, vestingWalletAddr, vestingAmount, ethAmount, now, duration, cliff };
  }

  it("should correctly handle ERC20 + ETH vesting and support all public functions", async function () {
    const { user1, token, manager, vestingWalletAddr, vestingAmount, ethAmount, now, duration, cliff } = await loadFixture(deployFixture);

    const wallets = await manager.getAllVestingWallets();
    expect(wallets.length).to.equal(1);
    expect(wallets[0]).to.equal(vestingWalletAddr);

    const walletFromGetter = await manager.getVestingWallet(user1.address);
    expect(walletFromGetter).to.equal(vestingWalletAddr);

    await time.increaseTo(now + cliff - 1);

    let erc20Releasable = await manager.releasableAmountERC20(user1.address, await token.getAddress());
    let ethReleasable = await manager.releasableETH(user1.address);
    expect(erc20Releasable).to.equal(0n);
    expect(ethReleasable).to.equal(0n);

    const sixMonths = BigInt(duration) / 2n;
    await time.increaseTo(now + cliff + Number(sixMonths));

    const expectedERC20 = (vestingAmount * sixMonths) / BigInt(duration);
    erc20Releasable = await manager.releasableAmountERC20(user1.address, await token.getAddress());
    console.log("ERC20 Expected:", expectedERC20.toString());
    console.log("ERC20 Releasable:", erc20Releasable.toString());
    expect(erc20Releasable).to.equal(expectedERC20);

    const balanceBeforeERC20 = await token.balanceOf(user1.address);
    await manager.releaseVestedTokensERC20(user1.address, await token.getAddress());
    const balanceAfterERC20 = await token.balanceOf(user1.address);
    const releasedERC20 = balanceAfterERC20 - balanceBeforeERC20;
    expect(releasedERC20).to.be.closeTo(expectedERC20, ethers.parseUnits("0.01", 18));
    console.log("ERC20 Released:", ethers.formatUnits(releasedERC20));

    const expectedETH = (ethAmount * sixMonths) / BigInt(duration);
    ethReleasable = await manager.releasableETH(user1.address);
    console.log("ETH Expected:", ethers.formatEther(expectedETH));
    console.log("ETH Releasable:", ethers.formatEther(ethReleasable));
    expect(ethReleasable).to.be.closeTo(expectedETH, ethers.parseEther("0.001"));

    const balanceBeforeETH = await ethers.provider.getBalance(user1.address);
    const tx = await manager.connect(user1).releaseVestedETH(user1.address);
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed * receipt.gasPrice;

    const balanceAfterETH = await ethers.provider.getBalance(user1.address);
    const releasedETH = balanceAfterETH - balanceBeforeETH + gasUsed;

    console.log("ETH Released:", ethers.formatEther(releasedETH));
    expect(releasedETH).to.be.closeTo(expectedETH, ethers.parseEther("0.001"));
  });
});

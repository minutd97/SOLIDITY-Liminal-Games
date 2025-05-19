const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Liminal Test Contracts: SpiritToken + Factory", function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    // Deploy LIM token (LiminalToken)
    const LiminalToken = await ethers.getContractFactory("LiminalToken");
    const lim = await LiminalToken.deploy();
    await lim.waitForDeployment();

    // Deploy Spirit token
    const SpiritToken = await ethers.getContractFactory("SpiritToken");
    const spirit = await SpiritToken.deploy();
    await spirit.waitForDeployment();

    // Deploy Factory
    const SpiritTokenFactory = await ethers.getContractFactory("SpiritTokenFactory");
    // Set pegRate as 0.01 LIM per 1 SPIRIT (both with 18 decimals)
    // ethers.parseUnits("0.01", 18) = 10000000000000000 (1e16)
    const pegRate = ethers.parseUnits("0.01", 18); // 0.01 LIM/SPIRIT, 18 decimals
    const redeemFee = 100; // 1%
    const factory = await SpiritTokenFactory.deploy(
      await spirit.getAddress(),
      await lim.getAddress(),
      pegRate,
      redeemFee
    );
    await factory.waitForDeployment();

    // Give users LIM for testing
    await lim.connect(owner).transfer(user1.address, ethers.parseUnits("10", 18));
    await lim.connect(owner).transfer(user2.address, ethers.parseUnits("10", 18));

    // Grant minter role to factory
    await spirit.connect(owner).grantMinterRole(await factory.getAddress());
    await spirit.connect(owner).renounceAdmin();

    return { owner, user1, user2, lim, spirit, factory, pegRate, redeemFee };
  }

  it("should mint SPIRIT from LIM", async function () {
    const { user1, spirit, factory, lim, pegRate } = await loadFixture(deployFixture);

    // User approves LIM to factory
    const spiritAmount = ethers.parseUnits("100", 18); // 100 SPIRIT
    const requiredLIM = (spiritAmount * pegRate) / ethers.parseUnits("1", 18);

    await lim.connect(user1).approve(factory.getAddress(), requiredLIM);

    await factory.connect(user1).mintSpirit(spiritAmount);

    const userSpirit = await spirit.balanceOf(user1.address);
    expect(userSpirit).to.equal(spiritAmount);

    const factoryLIM = await lim.balanceOf(factory.getAddress());
    expect(factoryLIM).to.equal(requiredLIM);
  });

  it("should redeem SPIRIT to LIM minus redeem fee", async function () {
    const { user1, spirit, factory, lim, pegRate, redeemFee } = await loadFixture(deployFixture);

    // Mint SPIRIT first
    const spiritAmount = ethers.parseUnits("100", 18); // 100 SPIRIT
    const requiredLIM = (spiritAmount * pegRate) / ethers.parseUnits("1", 18);

    await lim.connect(user1).approve(factory.getAddress(), requiredLIM);
    await factory.connect(user1).mintSpirit(spiritAmount);

    // Approve SPIRIT to factory for burn
    await spirit.connect(user1).approve(factory.getAddress(), spiritAmount);

    // Calculate expected payout
    const limAmount = (spiritAmount * pegRate) / ethers.parseUnits("1", 18);
    const fee = (limAmount * BigInt(redeemFee)) / 10000n;
    const payout = limAmount - fee;

    const before = await lim.balanceOf(user1.address);
    await factory.connect(user1).redeemSpirit(spiritAmount);
    const after = await lim.balanceOf(user1.address);

    // User received LIM minus fee
    expect(after - before).to.equal(payout);
  });

  it("should allow owner to withdraw collected fees and a wallet to deposit to public reserve", async function () {
    const { owner, user1, factory, spirit, lim, user2, pegRate, redeemFee } = await loadFixture(deployFixture);

    // Mint and redeem to generate fees
    const spiritAmount = ethers.parseUnits("100", 18); // 100 SPIRIT
    const requiredLIM = (spiritAmount * pegRate) / ethers.parseUnits("1", 18);

    await lim.connect(user1).approve(factory.getAddress(), requiredLIM);
    await factory.connect(user1).mintSpirit(spiritAmount);

    await spirit.connect(user1).approve(factory.getAddress(), spiritAmount);
    await factory.connect(user1).redeemSpirit(spiritAmount);

    const limAmount = (spiritAmount * pegRate) / ethers.parseUnits("1", 18);
    const expectedFee = (limAmount * BigInt(redeemFee)) / 10000n;

    // Factory should hold only the fee
    const factoryLIM = await lim.balanceOf(factory.getAddress());
    expect(factoryLIM).to.equal(expectedFee);

    // Owner collects fees
    const before = await lim.balanceOf(owner.address);
    await factory.connect(owner).collectProtocolFees();
    const after = await lim.balanceOf(owner.address);

    expect(after - before).to.equal(expectedFee);
    const collected = await factory.collectedProtocolFees();
    expect(collected).to.equal(0);

    // Deposit to public reserve
    await lim.connect(user2).approve(factory.getAddress(), ethers.parseUnits("1", 18));
    await factory.connect(user2).depositToPublicReserve(ethers.parseUnits("1", 18));
    const publicReserve = await factory.publicProtocolReserve();
    expect(publicReserve).to.equal(ethers.parseUnits("1", 18));
  });
});

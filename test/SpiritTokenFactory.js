const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect, use } = require("chai");
const { ethers } = require("hardhat");

describe("Liminal Test Contracts: SpiritToken + Factory", function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    const SpiritToken = await ethers.getContractFactory("SpiritToken");
    const spirit = await SpiritToken.deploy();
    await spirit.waitForDeployment();

    const SpiritTokenFactory = await ethers.getContractFactory("SpiritTokenFactory");
    const factory = await SpiritTokenFactory.deploy(
      await spirit.getAddress(),
      ethers.parseUnits("0.00004", "ether"), // pegRate = 0.00004 ETH
      100 // burnFee = 1%
    );
    await factory.waitForDeployment();

    // Grant minter role to factory
    await spirit.connect(owner).grantMinterRole(await factory.getAddress());

    return { owner, user1, user2, spirit, factory };
  }

  it("should mint SPIRIT from ETH", async function () {
    const {owner, user1, spirit, factory } = await loadFixture(deployFixture);

    await factory.connect(owner).setPegRate(ethers.parseUnits("0.00004", "ether"));
    await factory.connect(owner).setRedeemFee(100);

    const ethSent = ethers.parseEther("0.004"); // Expect 100 SPIRIT
    await factory.connect(user1).mintSpirit({ value: ethSent });

    const userBalance = await spirit.balanceOf(user1.address);
    expect(userBalance).to.equal(ethers.parseUnits("100", 18));

    const contractEth = await ethers.provider.getBalance(factory.getAddress());
    expect(contractEth).to.equal(ethSent);
  });

  it("should redeem SPIRIT to ETH minus redeem fee", async function () {
    const { user1, spirit, factory } = await loadFixture(deployFixture);

    // Mint first
    const ethSent = ethers.parseEther("0.004"); // 100 SPIRIT
    await factory.connect(user1).mintSpirit({ value: ethSent });

    const spiritAmount = ethers.parseUnits("100", 18);
    const pegRate = await factory.pegRate(); // 0.00004 ETH/SPIRIT
    const redeemFee = await factory.redeemFee(); // 1%

    const expectedEth = (spiritAmount * pegRate) / 10n ** 18n;
    const expectedFee = (expectedEth * redeemFee) / 10000n;
    const expectedPayout = expectedEth - expectedFee;

    // Approve + redeem
    await spirit.connect(user1).approve(factory.getAddress(), spiritAmount);
    const before = await ethers.provider.getBalance(user1.address);

    const tx = await factory.connect(user1).redeemSpirit(spiritAmount);
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed * receipt.gasPrice;

    const after = await ethers.provider.getBalance(user1.address);
    
    const delta = BigInt(after - before + gasUsed);
    expect(delta).to.equal(expectedPayout);
  });

  it("should allow owner to withdraw collected fees and a wallet to deposit to public reserve", async function () {
    const { owner, user1, factory, spirit, user2 } = await loadFixture(deployFixture);

    await factory.connect(user1).mintSpirit({ value: ethers.parseEther("0.004") }); // 100 SPIRIT
    await spirit.connect(user1).approve(factory.getAddress(), ethers.parseUnits("100", 18));
    await factory.connect(user1).redeemSpirit(ethers.parseUnits("100", 18));
    
    const factoryBalance = await ethers.provider.getBalance(factory.getAddress());
    const expectedFee = ethers.parseUnits("0.00004", "ether"); // Matches 1% fee of 0.004 ETH
    expect(factoryBalance).to.equal(expectedFee);

    const before = await ethers.provider.getBalance(owner.address);
    const tx = await factory.connect(owner).collectProtocolFees();
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed * receipt.gasPrice;
    const after = await ethers.provider.getBalance(owner.address);

    const collected = await factory.collectedProtocolFees();
    expect(collected).to.equal(0);
    expect(after - before + gasUsed).to.be.gt(0); // Owner received fees

    await factory.connect(user2).depositToPublicReserve({ value: ethers.parseEther("1") }); // 1 ETH
    const publicReserve = await factory.publicProtocolReserve();
    expect(publicReserve).to.equal(ethers.parseEther("1"));
  });
});

const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("UniswapV4PoolCreator", function () {
  async function deployFixture() {
    const [owner] = await ethers.getSigners();

    // Deploy LiminalToken
    const LIM = await ethers.getContractFactory("LiminalToken");
    const lim = await LIM.deploy();
    await lim.waitForDeployment();
    console.log("LIM deployed to:", await lim.getAddress());

    // Use real Uniswap v4 deployment addresses (update these!)
    const poolManager = "0x360e68faccca8ca495c1b759fd9eee466db9fb32";       // Uniswap V4 PoolManager address
    const positionManager = "0xd88f38f930b7952f2db2432cb002e7abbf3dd869";   // Uniswap V4 PositionManager address
    const permit2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";        // Permit2 address

    // Deploy our pool creator
    const PoolCreator = await ethers.getContractFactory("UniswapV4PoolCreator");
    const creator = await PoolCreator.deploy(poolManager, positionManager, permit2);
    await creator.waitForDeployment();
    console.log("PoolCreator deployed to:", await creator.getAddress());

    return { owner, lim, creator, poolManager, positionManager };
  }

  it("should create a pool with ETH and LIM without reverting", async function () {
    const { owner, lim, creator } = await loadFixture(deployFixture);

    // Approve LIM tokens to PositionManager
    await lim.approve(await creator.positionManager(), ethers.MaxUint256);

    const tokenAddress = await lim.getAddress();

    const poolInput = {
      token0: ethers.ZeroAddress, // ETH as token0
      token1: tokenAddress,       // LIM
      fee: 3000,
      tickSpacing: 60,
      sqrtPriceX96: await creator.getSqrtPriceX96(
        2000, // LIM is worth 1/2000 ETH
        18,   // ETH decimals
        18    // LIM decimals
      ),
      tickLower: -887220,
      tickUpper: 887220,
      liquidity: ethers.parseUnits("1", 18), // Adjust as needed
      recipient: owner.address
    };

    const tx = await creator.createPoolAndAddLiquidity(poolInput, {
      value: ethers.parseEther("1.0"), // Send ETH for the liquidity side
    });

    await tx.wait();

    console.log("✅ Pool created with ETH + LIM");
  });
});

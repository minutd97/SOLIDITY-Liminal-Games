const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const MAX_UINT160 = BigInt("0xffffffffffffffffffffffffffffffffffffffff"); // 2^160 - 1
const MAX_UINT48  = BigInt("0xffffffffffff");                               // 2^48 - 1

// Use real Uniswap v4 deployment addresses (update these!)
const POOL_MANAGER = "0x360e68faccca8ca495c1b759fd9eee466db9fb32";       // Uniswap V4 PoolManager address
const POSITION_MANAGER = "0xd88f38f930b7952f2db2432cb002e7abbf3dd869";   // Uniswap V4 PositionManager address

const PERMIT2_ABI = [
    "function approve(address token, address spender, uint160 amount, uint48 expiration) external"
  ];
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // Permit2 address
  
describe("UniswapV4PoolCreator", function () {
  async function deployFixture() {
    const [owner] = await ethers.getSigners();

    // Deploy LiminalToken
    const LIM = await ethers.getContractFactory("LiminalToken");
    const lim = await LIM.deploy();
    await lim.waitForDeployment();
    console.log("LIM deployed to:", await lim.getAddress());

    // Deploy our pool creator
    const PoolCreator = await ethers.getContractFactory("UniswapV4PoolCreator");
    const creator = await PoolCreator.deploy(POOL_MANAGER, POSITION_MANAGER, PERMIT2_ADDRESS);
    await creator.waitForDeployment();
    console.log("PoolCreator deployed to:", await creator.getAddress());

    return { owner, lim, creator };
  }

  it("should create a pool with ETH and LIM without reverting", async function () {
    const { owner, lim, creator } = await loadFixture(deployFixture);

    const ownerBalance = await lim.balanceOf(owner.address);
    console.log(`Owner LIM Balance: ${ethers.formatUnits(ownerBalance, 18)}`);

    const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, owner);

    //await lim.connect(owner).approve(POSITION_MANAGER, ethers.MaxUint256);
    //console.log("Approved PositionManager to spend LIM tokens");

    // Approve Permit2 to spend LIM tokens
    await lim.connect(owner).approve(PERMIT2_ADDRESS, ethers.MaxUint256);

    // Approve PositionManager via Permit2
    await permit2.connect(owner).approve(
        await lim.getAddress(),
        POSITION_MANAGER,
        MAX_UINT160, // uint160 max
        MAX_UINT48   // uint48 max
    );
    console.log("Permit2 approved PositionManager to spend LIM tokens");

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

    console.log("Calling createPoolAndAddLiquidity...");
    const tx = await creator.createPoolAndAddLiquidity(poolInput, {
      value: ethers.parseEther("1.0"), // Send ETH for the liquidity side
    });

    await tx.wait();

    console.log("✅ Pool created with ETH + LIM");
  });
});

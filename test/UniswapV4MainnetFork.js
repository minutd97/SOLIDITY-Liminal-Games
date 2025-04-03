const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // Arbitrum USDC
const USDC_WHALE = "0x52Aa899454998Be5b000Ad077a46Bbe360F4e497";

const MOCKTOKEN_ADDRESS = "0x845EbEa7A03D1eE7A3ab2C1AA1d93D0aaecfBd35";

const MAX_UINT160 = BigInt("0xffffffffffffffffffffffffffffffffffffffff"); // 2^160 - 1
const MAX_UINT48  = BigInt("0xffffffffffff");                               // 2^48 - 1

// Use real Uniswap v4 deployment addresses (update these!)
const POOL_MANAGER = "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317";       // Uniswap V4 PoolManager address
const POSITION_MANAGER = "0xAc631556d3d4019C95769033B5E719dD77124BAc";   // Uniswap V4 PositionManager address

const PERMIT2_ABI = [
    "function approve(address token, address spender, uint160 amount, uint48 expiration) external"
  ];
const PERMIT2_ADDRESS = "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768"; // Permit2 address
  
describe("UniswapV4PoolCreator", function () {
  async function deployFixture() {
    const [owner] = await ethers.getSigners();

    // Deploy LiminalToken
    // const LIM = await ethers.getContractFactory("LiminalToken");
    // const lim = await LIM.deploy();
    // await lim.waitForDeployment();
    // console.log("LIM deployed to:", await lim.getAddress());

    // Deploy our pool creator
    const PoolCreator = await ethers.getContractFactory("UniswapV4PoolCreator");
    const creator = await PoolCreator.deploy(POOL_MANAGER, POSITION_MANAGER, PERMIT2_ADDRESS);
    await creator.waitForDeployment();
    console.log("PoolCreator deployed to:", await creator.getAddress());

    return { owner, creator }; //lim
  }

  it("should create a pool with ETH and MOCK without reverting", async function () {
    const { owner, creator } = await loadFixture(deployFixture);
  
    const DEPLOYER_ADDRESS = "0x179D189A7739d31Ba5a1839E3140958e20f1382e";

    // Impersonate the deployer wallet (who owns all the MockToken)
    await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [DEPLOYER_ADDRESS],
    });

    const mockDeployer = await ethers.getSigner(DEPLOYER_ADDRESS);
    const mock = await ethers.getContractAt("IERC20", MOCKTOKEN_ADDRESS, mockDeployer);

    // Transfer tokens to owner
    const amount = ethers.parseUnits("1000000", 18);
    await mock.transfer(owner.address, amount);
    console.log(`✅ Transferred ${ethers.formatUnits(amount, 18)} MOCK to owner`);

    // Stop impersonating (optional but clean)
    await network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [DEPLOYER_ADDRESS],
    });
  
    const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, owner);
    await mock.connect(owner).approve(PERMIT2_ADDRESS, ethers.MaxUint256);
    await permit2.connect(owner).approve(
      MOCKTOKEN_ADDRESS,
      POSITION_MANAGER,
      MAX_UINT160,
      MAX_UINT48
    );
    console.log("Permit2 approved PositionManager to spend MOCK tokens");
  
    const sqrtPrice = await creator.getSqrtPriceX96(1000, 18, 18); // 1 ETH = 1000 MOCK
    const poolInput = {
      token0: ethers.ZeroAddress,   // ETH
      token1: MOCKTOKEN_ADDRESS,         // MOCK
      fee: 3000,
      tickSpacing: 60,
      sqrtPriceX96: sqrtPrice,
      tickLower: -60000,
      tickUpper: 60000,
      liquidity: ethers.parseUnits("1", 18),
      recipient: owner.address
    };
  
    // Send MOCK tokens to PositionManager manually
    // await mock.connect(owner).transfer(POSITION_MANAGER, ethers.parseUnits("10", 18));
    // const balance = await mock.balanceOf(POSITION_MANAGER);
    // console.log("MOCK in PositionManager:", ethers.formatUnits(balance, 18));
    
    console.log("Initializing pool...");
    await creator.connect(owner).initializePoolOnly(poolInput); // new function
    await network.provider.send("evm_mine"); // ensure block confirmation

    console.log("Minting pool...");
    const tx = await creator.connect(owner).createPoolAndAddLiquidity(poolInput, {
    value: ethers.parseEther("1"),
    });
    await tx.wait();
  
    console.log("✅ Pool created with ETH + MOCK");
  });
});

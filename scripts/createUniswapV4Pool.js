const { ethers, network } = require("hardhat");

const MOCKTOKEN_ADDRESS = "0x845EbEa7A03D1eE7A3ab2C1AA1d93D0aaecfBd35";
const MOCK_DEPLOYER = "0x179D189A7739d31Ba5a1839E3140958e20f1382e";

const WETH_ADDRESS = "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"; // Arbitrum WETH
const WETH_ABI = [
  "function deposit() public payable",
  "function approve(address spender, uint256 amount) public returns (bool)"
];

const PERMIT2_ADDRESS = "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768";
const POOL_MANAGER = "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317";
const POSITION_MANAGER = "0xAc631556d3d4019C95769033B5E719dD77124BAc";

const MAX_UINT160 = BigInt("0xffffffffffffffffffffffffffffffffffffffff");
const MAX_UINT48 = BigInt("0xffffffffffff");

const PERMIT2_ABI = [
  "function approve(address token, address spender, uint160 amount, uint48 expiration) external"
];

async function main() {
  const [owner] = await ethers.getSigners();

  // 🛠 Deploy UniswapV4PoolCreator
  const PoolCreator = await ethers.getContractFactory("UniswapV4PoolCreator");
  const creator = await PoolCreator.deploy(POOL_MANAGER, POSITION_MANAGER, PERMIT2_ADDRESS);
  await creator.waitForDeployment();
  console.log("PoolCreator deployed to:", await creator.getAddress());

  // 🪙 Impersonate MOCK deployer & transfer tokens to owner
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [MOCK_DEPLOYER] });
  const mockDeployer = await ethers.getSigner(MOCK_DEPLOYER);
  const mock = await ethers.getContractAt("IERC20", MOCKTOKEN_ADDRESS, mockDeployer);
  await mock.transfer(owner.address, ethers.parseUnits("1000000", 18));
  await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [MOCK_DEPLOYER] });

  // Wrap ETH into WETH
  const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, owner);
  await weth.deposit({ value: ethers.parseEther("100") });
  console.log("✅ Wrapped 100 ETH into WETH");

  // ✅ Approve Permit2 for MOCK and WETH
  const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, owner);
  await mock.connect(owner).approve(PERMIT2_ADDRESS, ethers.MaxUint256);
  await weth.connect(owner).approve(PERMIT2_ADDRESS, ethers.MaxUint256);
  await permit2.approve(MOCKTOKEN_ADDRESS, POSITION_MANAGER, MAX_UINT160, MAX_UINT48);
  await permit2.approve(WETH_ADDRESS, POSITION_MANAGER, MAX_UINT160, MAX_UINT48);
  console.log("Permit2 approved PositionManager to spend MOCK and WETH tokens");

  // 📈 Prepare pool input
  const sqrtPrice = await creator.getSqrtPriceX96(1000, 18, 18); // 1 WETH = 1000 MOCK
  const poolInput = {
    token0: WETH_ADDRESS,
    token1: MOCKTOKEN_ADDRESS,
    fee: 3000,
    tickSpacing: 60,
    sqrtPriceX96: sqrtPrice,
    tickLower: -300,
    tickUpper: 300,
    liquidity: ethers.parseUnits("0.01", 18),
    recipient: owner.address
  };

  // 🌀 Initialize & mint
  console.log("Initializing pool...");
  await creator.connect(owner).initializePoolOnly(poolInput);
  await network.provider.send("evm_mine");

  console.log("Minting pool...");
  const tx = await creator.connect(owner).createPoolAndAddLiquidity(poolInput);
  await tx.wait();

  console.log("✅ Pool created with WETH + MOCK");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});

function getAmountsForLiquidity(sqrtPriceX96, tickLower, tickUpper, liquidity) {
  const Q96 = BigInt(2) ** BigInt(96);

  const sqrtRatioAX96 = BigInt(Math.min(sqrtPriceX96, tickToSqrtPriceX96(tickLower)));
  const sqrtRatioBX96 = BigInt(Math.max(sqrtPriceX96, tickToSqrtPriceX96(tickUpper)));

  const liquidityBigInt = BigInt(liquidity);

  const amount0 = (liquidityBigInt * (sqrtRatioBX96 - sqrtRatioAX96) * Q96) /
                  (sqrtRatioBX96 * sqrtRatioAX96);

  const amount1 = (liquidityBigInt * (sqrtRatioBX96 - sqrtRatioAX96)) / Q96;

  return {
    amount0: amount0.toString(),
    amount1: amount1.toString(),
  };
}

function getAmountsForLiquidity(sqrtPriceX96, tickLower, tickUpper, liquidity) {
  const Q96 = BigInt(2) ** BigInt(96);

  const sqrtRatioAX96 = BigInt(Math.min(sqrtPriceX96, tickToSqrtPriceX96(tickLower)));
  const sqrtRatioBX96 = BigInt(Math.max(sqrtPriceX96, tickToSqrtPriceX96(tickUpper)));

  const liquidityBigInt = BigInt(liquidity);

  const amount0 = (liquidityBigInt * (sqrtRatioBX96 - sqrtRatioAX96) * Q96) /
                  (sqrtRatioBX96 * sqrtRatioAX96);

  const amount1 = (liquidityBigInt * (sqrtRatioBX96 - sqrtRatioAX96)) / Q96;

  return {
    amount0: amount0.toString(),
    amount1: amount1.toString(),
  };
}

// Helper: converts tick to sqrtPriceX96 approx using Uniswap formula
function tickToSqrtPriceX96(tick) {
  const sqrtRatio = Math.pow(1.0001, tick / 2);
  return BigInt(Math.floor(sqrtRatio * Math.pow(2, 96)));
}

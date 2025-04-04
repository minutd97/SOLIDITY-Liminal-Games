const { ethers, network } = require("hardhat");
const abiCoder = ethers.AbiCoder.defaultAbiCoder();

const MOCKTOKEN_ADDRESS = "0x845EbEa7A03D1eE7A3ab2C1AA1d93D0aaecfBd35";
const MOCK_DEPLOYER = "0x179D189A7739d31Ba5a1839E3140958e20f1382e";

const WETH_ADDRESS = "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"; // Arbitrum WETH
const WETH_ABI = [
  "function deposit() public payable",
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function transfer(address recipient, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
];

const POOL_MANAGER = "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317";
const POOL_MANAGER_ABI = require('../abis/V4PoolManagerAbi.json');

const POSITION_MANAGER = "0xAc631556d3d4019C95769033B5E719dD77124BAc";
const POSITION_MANAGER_ABI = require('../abis/V4PositionManagerAbi.json');

const PERMIT2_ADDRESS = "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768";
const PERMIT2_ABI = [
  "function approve(address token, address spender, uint160 amount, uint48 expiration) external"
];

const MAX_UINT160 = BigInt("0xffffffffffffffffffffffffffffffffffffffff");
const MAX_UINT48 = BigInt("0xffffffffffff");

const sqrtPriceX96 = BigInt("2505414483696303623581886281350"); // corresponds to 1 WETH = 1000 MOCK
const tickLower = -1200;
const tickUpper = 1200;

async function main() {
  const [owner] = await ethers.getSigners();

  await network.provider.request({ method: "hardhat_impersonateAccount", params: [MOCK_DEPLOYER] });
  const mockDeployer = await ethers.getSigner(MOCK_DEPLOYER);
  const mock = await ethers.getContractAt("IERC20", MOCKTOKEN_ADDRESS, mockDeployer);
  await mock.transfer(owner.address, ethers.parseUnits("1000000", 18));
  await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [MOCK_DEPLOYER] });
  console.log("✅ Transferred 1M MOCK to owner");

  const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, owner);
  await weth.deposit({ value: ethers.parseEther("100") });
  console.log("✅ Wrapped 100 ETH into WETH");

  // 3. Approve Permit2 and then PositionManager for both tokens
  const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, owner);
  await (await weth.connect(owner).approve(PERMIT2_ADDRESS, MAX_UINT160)).wait();
  await (await mock.connect(owner).approve(PERMIT2_ADDRESS, MAX_UINT160)).wait();
  await (await permit2.approve(WETH_ADDRESS, POSITION_MANAGER, MAX_UINT160, MAX_UINT48)).wait();
  await (await permit2.approve(MOCKTOKEN_ADDRESS, POSITION_MANAGER, MAX_UINT160, MAX_UINT48)).wait();
  console.log("✅ Approved tokens to Permit2 & PositionManager");

  // // 4. Transfer tokens to PositionManager
  // const wethAmount = ethers.parseUnits("100", 18);
  // const mockAmount = ethers.parseUnits("1000000", 18);
  // await (await weth.connect(owner).transfer(POSITION_MANAGER, wethAmount)).wait();
  // await (await mock.connect(owner).transfer(POSITION_MANAGER, mockAmount)).wait();
  // console.log("✅ Transferred WETH + MOCK to PositionManager");

  // 5. Prepare contract instances
  const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, owner);
  const poolManager = new ethers.Contract(POOL_MANAGER, POOL_MANAGER_ABI, owner);

  // 6. Sort tokens and build poolKey
  const currency0 = WETH_ADDRESS.toLowerCase() < MOCKTOKEN_ADDRESS.toLowerCase() ? WETH_ADDRESS : MOCKTOKEN_ADDRESS;
  const currency1 = WETH_ADDRESS.toLowerCase() < MOCKTOKEN_ADDRESS.toLowerCase() ? MOCKTOKEN_ADDRESS : WETH_ADDRESS;
  
  const fee = 3000;
  const tickSpacing = 60;
  const tickLower = -1200;
  const tickUpper = 1200;
  const liquidity = ethers.parseUnits("1", 18); // 1 liquidity unit
  const amount0Max = ethers.parseUnits("1000000", 18);
  const amount1Max = ethers.parseUnits("100", 18);
  const hookData = "0x"; // No hook data
  const deadline = Math.floor(Date.now() / 1000) + 60;
  const hooks = ethers.ZeroAddress;

  const MINT_POSITION = 0;
  const SETTLE_PAIR = 1;

  const actions = ethers.hexlify(Uint8Array.from([MINT_POSITION, SETTLE_PAIR]));

  // PoolKey
  const poolKey = [
    currency0,
    currency1,
    fee,
    tickSpacing,
    hooks
  ];

   // --- STEP 1: ENCODE mintParams[0] (MINT_POSITION) ---
   const mintParam0 = abiCoder.encode(
    [
      "tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)",
      "int24", "int24", "uint128", "uint256", "uint256", "address", "bytes"
    ],
    [
      poolKey,
      tickLower,
      tickUpper,
      liquidity,
      amount0Max,
      amount1Max,
      owner.address,
      hookData
    ]
  );

  // --- STEP 2: ENCODE mintParams[1] (SETTLE_PAIR) ---
  const mintParam1 = abiCoder.encode(["address", "address"], [currency0, currency1]);

  // --- STEP 3: ENCODE modifyLiquidities(bytes) ---
  const mintParams = [mintParam0, mintParam1];

  // 1. Encode [actions, mintParams] together
  const encodedPayload = abiCoder.encode(
    ["bytes", "bytes[]"],
    [actions, mintParams]
  );

  const modifyCallData = positionManager.interface.encodeFunctionData(
    "modifyLiquidities",
    [encodedPayload, deadline]
  );

  // --- STEP 4: ENCODE initializePool() ---
  const initCallData = poolManager.interface.encodeFunctionData(
    "initializePool",
    [poolKey, sqrtPriceX96]
  );

  // --- STEP 5: Call multicall() with both ---
  const multicallParams = [initCallData, modifyCallData];

  console.log("Calling PoisitionManager.multicall()...");
  const tx = await positionManager.multicall(multicallParams);
  await tx.wait();

  console.log("✅ Pool initialized + liquidity minted!");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});


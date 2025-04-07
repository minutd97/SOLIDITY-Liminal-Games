const { ethers, network } = require("hardhat");
const abiCoder = ethers.AbiCoder.defaultAbiCoder();
const { keccak256, toUtf8Bytes } = require("ethers");

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
const POOL_MANAGER_ABI = [
  {
    name: "initialize",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" }
        ]
      },
      {
        name: "sqrtPriceX96",
        type: "uint160"
      }
    ],
    outputs: [
      {
        name: "tick",
        type: "int24"
      }
    ]
  }
];

const POSITION_MANAGER = "0xAc631556d3d4019C95769033B5E719dD77124BAc";
const POSITION_MANAGER_ABI = [
  {
    name: "unlock",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "data", type: "bytes" }],
    outputs: [{ name: "result", type: "bytes" }]
  },
  {
    name: "modifyLiquidities",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "data", type: "bytes" },
      { name: "deadline", type: "uint256" }
    ],
    outputs: []
  }
];

const PERMIT2_ADDRESS = "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768";
const PERMIT2_ABI = [
  "function approve(address token, address spender, uint160 amount, uint48 expiration) external"
];

const MAX_UINT160 = BigInt("0xffffffffffffffffffffffffffffffffffffffff");
const MAX_UINT48 = BigInt("0xffffffffffff");

let sqrtPriceX96 = BigInt("2505414483696303623581886281350"); // corresponds to 1 WETH = 1000 MOCK

async function main() {
  await network.provider.send("hardhat_reset", [{
    forking: {
      jsonRpcUrl: "https://sepolia-rollup.arbitrum.io/rpc"
    }
  }]);
  
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

  // 4. Transfer tokens to PositionManager
  const wethAmount = ethers.parseUnits("100", 18);
  const mockAmount = ethers.parseUnits("1000000", 18);
  await (await weth.connect(owner).transfer(POSITION_MANAGER, wethAmount)).wait();
  await (await mock.connect(owner).transfer(POSITION_MANAGER, mockAmount)).wait();
  console.log("✅ Transferred WETH + MOCK to PositionManager");

  // 5. Prepare contract instances
  const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, owner);
  const poolManager = new ethers.Contract(POOL_MANAGER, POOL_MANAGER_ABI, owner);

  // 6. Sort tokens and build poolKey
  // // Make sure these are correctly ordered
  let currency0 = WETH_ADDRESS.toLowerCase() < MOCKTOKEN_ADDRESS.toLowerCase() ? WETH_ADDRESS : MOCKTOKEN_ADDRESS;
  let currency1 = WETH_ADDRESS.toLowerCase() < MOCKTOKEN_ADDRESS.toLowerCase() ? MOCKTOKEN_ADDRESS : WETH_ADDRESS;
  if (MOCKTOKEN_ADDRESS.toLowerCase() < WETH_ADDRESS.toLowerCase()) {
    currency0 = MOCKTOKEN_ADDRESS;
    currency1 = WETH_ADDRESS;
  } else {
    currency0 = WETH_ADDRESS;
    currency1 = MOCKTOKEN_ADDRESS;
  }

  console.log("Currency0:", currency0);
  console.log("Currency1:", currency1);
  
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

  //const actions = ethers.hexlify(Uint8Array.from([MINT_POSITION, SETTLE_PAIR]));

    // 2. Create the correct poolKey structure
  const poolKey = {
    currency0,
    currency1,
    fee,
    tickSpacing,
    hooks
  };

  const poolId = keccak256(abiCoder.encode(
    ["address", "address", "uint24", "int24", "address"],
    [currency0, currency1, fee, tickSpacing, hooks]
  ));
  console.log("PoolId:", poolId);

  //console.log("sqrtPriceX96 before:", sqrtPriceX96);
  console.log("PoolKey:", poolKey);
  sqrtPriceX96 = encodePriceSqrt(1, 1000); // 1 WETH = 1000 MOCK
  console.log("sqrtPriceX96 after encodePriceSqrt:", sqrtPriceX96);

  // 3. Try to initialize the pool (it may already be initialized)
  try {
    console.log("Initializing pool...");
    const initTx = await poolManager.initialize(poolKey, sqrtPriceX96);
    await initTx.wait();
    console.log("✅ Pool initialized!");
  } catch (error) {
    if (error.message.includes("reverted with custom error")) {
      console.error("❌ Revert reason (custom error):", error.message);
    } else {
      console.error("❌ Error initializing pool:", error);
    }
  
    if (error.txHash) {
      console.log("⚠️ Run this for a full trace:");
      console.log(`npx hardhat trace --tx ${error.txHash} --network localhost`);
    }
  
    return;
  }

  // 4. Prepare modifyLiquidities parameters
  //const MINT_POSITION = 0;
  //const SETTLE_PAIR = 1;

  // Make sure the actions encoding is correct
  const actions = "0x" + MINT_POSITION.toString(16).padStart(2, '0') + SETTLE_PAIR.toString(16).padStart(2, '0');
  console.log("Actions:", actions);

  // Create properly encoded mint parameters
  const mintParams = [];

  // First parameter - encodes pool key and position details
  mintParams.push(abiCoder.encode(
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
  ));

  // Second parameter - for SETTLE_PAIR, just the tokens
  mintParams.push(abiCoder.encode(
    ["address", "address"],
    [currency0, currency1]
  ));

  console.log("mintParams length:", mintParams.length);
  console.log("mintParams[0] length:", mintParams[0].length);
  console.log("mintParams[1] length:", mintParams[1].length);

  // Encode the final payload
  const encodedPayload = abiCoder.encode(
    ["bytes", "bytes[]"],
    [actions, mintParams]
  );

  // 5. Call modifyLiquidities
  console.log("Calling modifyLiquidities...");
  try {
    //const deadline = Math.floor(Date.now() / 1000) + 60 * 10; // 10 minutes from now
    const modifyTx = await positionManager.modifyLiquidities(encodedPayload, deadline);
    await modifyTx.wait();
    console.log("✅ Liquidity added successfully!");
  } catch (error) {
    console.error("Failed to modify liquidity:", error);
    
    // Try to get more information about the error
    if (error.data) {
      console.log("Error data:", error.data);
    }
  }
}

function encodePriceSqrt(token0Amount, token1Amount, token0Decimals = 18, token1Decimals = 18) {
  const scale0 = 10n ** BigInt(token0Decimals);
  const scale1 = 10n ** BigInt(token1Decimals);

  const numerator = BigInt(token1Amount) * scale1;
  const denominator = BigInt(token0Amount) * scale0;

  const ratioX96 = (BigInt(Math.floor(Math.sqrt(Number(numerator * (1n << 192n) / denominator)))));
  return ratioX96;
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});


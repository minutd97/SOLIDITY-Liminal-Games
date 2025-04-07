const { ethers, network } = require("hardhat");

const MOCKTOKEN_ADDRESS = "0x845EbEa7A03D1eE7A3ab2C1AA1d93D0aaecfBd35";
const MOCK_DEPLOYER = "0x179D189A7739d31Ba5a1839E3140958e20f1382e";
const WETH_ADDRESS = "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"; //"0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";

const WETH_ABI = [
  "function deposit() public payable",
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function transfer(address recipient, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)"
];

const POOL_MANAGER = "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317"; //"0x360e68faccca8ca495c1b759fd9eee466db9fb32";
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
    },
    {
      name: "unlock",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        {
          name: "data",
          type: "bytes"
        }
      ],
      outputs: [
        {
          name: "result",
          type: "bytes"
        }
      ]
    }
];

const POSITION_MANAGER = "0xAc631556d3d4019C95769033B5E719dD77124BAc";
const PERMIT2_ADDRESS = "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768";
const PERMIT2_ABI = [
  "function approve(address token, address spender, uint160 amount, uint48 expiration) external"
];

async function main() {
    await network.provider.send("hardhat_reset", [{
        forking: {
        jsonRpcUrl: "https://sepolia-rollup.arbitrum.io/rpc"
        }
    }]);

    const [owner] = await ethers.getSigners();

    // Deploy helper
    const Helper = await ethers.getContractFactory("V4PoolHelper");
    const helper = await Helper.deploy(POOL_MANAGER, POSITION_MANAGER, PERMIT2_ADDRESS);
    await helper.waitForDeployment();
    console.log("✅ Deployed V4PoolHelper at", helper.target);

    // Deploy helper
    // const LiminalToken = await ethers.getContractFactory("LiminalToken");
    // const limToken = await LiminalToken.deploy();
    // await limToken.waitForDeployment();
    // console.log("✅ Deployed LiminalToken at", limToken.target);

    // Get WETH and MOCK contracts
    //const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, owner);
    const mock = await ethers.getContractAt("IERC20", MOCKTOKEN_ADDRESS, owner);

    // Impersonate deployer to transfer MOCK
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [MOCK_DEPLOYER] });
    const mockDeployer = await ethers.getSigner(MOCK_DEPLOYER);
    const mockFromDeployer = await ethers.getContractAt("IERC20", MOCKTOKEN_ADDRESS, mockDeployer);
    await mockFromDeployer.transfer(owner.address, ethers.parseUnits("1000000", 18));
    await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [MOCK_DEPLOYER] });
    console.log("✅ Got 1M MOCK");

    // Wrap ETH
    //await weth.deposit({ value: ethers.parseEther("100") });
    //console.log("✅ Wrapped 100 ETH");

    //console.log(`Owner LIM balance: ${ethers.formatUnits(await limToken.balanceOf(owner.address), 18)}`);
    //const code = await ethers.provider.getCode(WETH_ADDRESS);
    //console.log("WETH bytecode:", code);
    //const wethBalance = await weth.balanceOf(owner.address);
    //console.log(`Owner WETH balance: ${wethBalance}`);

    // Approve and transfer tokens to helper
    //await mock.approve(helper.target, ethers.MaxUint256);
    //await weth.approve(helper.target, ethers.MaxUint256);
    // await helper.transferTokensIn(
    //     mock.target, 
    //     ethers.ZeroAddress, 
    //     ethers.parseUnits("1000", 18), 
    //     ethers.parseEther("1"), 
    //     { value: ethers.parseEther("1") });
    // console.log("✅ Sent MOCK & WETH to helper");

    // Encode sqrtPriceX96 for 1 WETH = 1000 MOCK
    //const sqrtPriceX96 = encodeSqrtPriceX96(1, 1000);

    // const tx = await helper.initializeAndAddLiquidity({
    //     token0: ethers.ZeroAddress,
    //     token1: mock.target,
    //     amount0: ethers.parseUnits("1", 18),
    //     amount1: ethers.parseUnits("1000", 18),
    //     fee: 3000,
    //     tickSpacing: 60,
    //     sqrtPriceX96,
    //     tickLower: -1200,
    //     tickUpper: 1200,
    //     recipient: owner.address
    // }, { value: ethers.parseEther("1") });

    await helper.setupPermit2Approvals(ethers.ZeroAddress, MOCKTOKEN_ADDRESS);
    console.log("✅ Approved tokens to Permit2");

    const poolInput = {
        token0: ethers.ZeroAddress,
        token1: MOCKTOKEN_ADDRESS,
        amount0: ethers.parseUnits("1", 18), // e.g. 1 ETH
        amount1: ethers.parseUnits("1000", 6), // e.g. 1000 USDC
        fee: 3000,
        tickSpacing: 60,
        tickLower: -60000,
        tickUpper: 60000,
        recipient: owner.address,
      };

    const tx = await helper.createPoolAndAddLiquidity(poolInput, { value: ethers.parseEther("1") });
    await tx.wait();
    console.log("✅ Pool initialized and liquidity added");

    // Step 1: Derive sorted order
    const [sorted0, sorted1] =
    ethers.ZeroAddress < MOCKTOKEN_ADDRESS
    ? [ethers.ZeroAddress, MOCKTOKEN_ADDRESS]
    : [MOCKTOKEN_ADDRESS, ethers.ZeroAddress];

    // Step 2: Build the PoolKey struct for encoding
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const poolKey = {
    currency0: sorted0,
    currency1: sorted1,
    fee: 3000,
    tickSpacing: 60,
    hooks: ethers.ZeroAddress
    };

    // Step 3: Encode the pool key and hash it to get poolId
    const encodedKey = abiCoder.encode(
    [
    "tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)"
    ],
    [[
    poolKey.currency0,
    poolKey.currency1,
    poolKey.fee,
    poolKey.tickSpacing,
    poolKey.hooks
    ]]
    );

    const poolId = ethers.keccak256(encodedKey);
    console.log("🆔 Pool ID:", poolId);

    // Step 4: Connect to PoolManager and query pool state
    const poolManager = new ethers.Contract(POOL_MANAGER, POOL_MANAGER_ABI, owner);
    const poolState = await poolManager.pools(poolId);
    console.log("📊 Pool exists:", poolState.sqrtPriceX96 !== 0n);
    console.log("🔢 Current sqrtPriceX96:", poolState.sqrtPriceX96.toString());

    // Step 5: Derive pool address and check balances
    const poolAddress = ethers.getAddress("0x" + poolId.slice(26)); // use last 20 bytes of hash
    console.log("📦 Pool address (predicted):", poolAddress);

    const reserveETH = await ethers.provider.getBalance(poolAddress);
    const reserveMOCK = await mock.balanceOf(poolAddress);

    console.log("💰 ETH reserve:", ethers.formatEther(reserveETH));
    console.log("💰 MOCK reserve:", ethers.formatUnits(reserveMOCK, 6));
}

// Helper to encode price sqrt
function encodeSqrtPriceX96(token0Amount, token1Amount) {
    const numerator = BigInt(token1Amount) * 10n ** 18n;
    const denominator = BigInt(token0Amount) * 10n ** 18n;
    const sqrtRatio = sqrt(numerator * (1n << 192n) / denominator);
    return sqrtRatio;
}

function sqrt(value) {
    if (value == 0n) return 0n;
    let z = value;
    let x = value / 2n + 1n;
    while (x < z) {
        z = x;
        x = (value / x + x) / 2n;
    }
    return z;
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

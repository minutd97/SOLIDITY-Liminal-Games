const { ethers, network } = require("hardhat");
const { WebSocketProvider } = require("ethers");

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
    },
    {
      name: "pools",
      type: "function",
      stateMutability: "view",
      inputs: [
        {
          name: "",
          type: "bytes32"
        }
      ],
      outputs: [
        {
          name: "sqrtPriceX96",
          type: "uint160"
        },
        {
          name: "tick",
          type: "int24"
        },
        {
          name: "liquidity",
          type: "uint128"
        },
        {
          name: "protocolFees",
          type: "tuple",
          components: [
            { name: "token0", type: "uint128" },
            { name: "token1", type: "uint128" }
          ]
        },
        {
          name: "feeGrowthGlobal0X128",
          type: "uint256"
        },
        {
          name: "feeGrowthGlobal1X128",
          type: "uint256"
        },
        {
          name: "locked",
          type: "bool"
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

    // Deploy LiminalToken
    const LiminalToken = await ethers.getContractFactory("LiminalToken");
    const limToken = await LiminalToken.deploy();
    await limToken.waitForDeployment();
    console.log("✅ Deployed LiminalToken at", limToken.target);

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

    await helper.setupPermit2Approvals(ethers.ZeroAddress, limToken.target);
    console.log("✅ Approved tokens to Permit2");

    const poolInput = {
        token0: ethers.ZeroAddress,
        token1: limToken.target,
        amount0: ethers.parseUnits("1", 18), // e.g. 1 ETH
        amount1: ethers.parseUnits("1000", 6), // e.g. 1000 USDC
        fee: 3000,
        tickSpacing: 60,
        tickLower: -60000,
        tickUpper: 60000,
        recipient: owner.address,
      };

    const tx = await helper.createPoolAndAddLiquidity(poolInput, { value: ethers.parseEther("1") });
    const receipt = await tx.wait();
    console.log("✅ Pool initialized and liquidity added");
    await listenToPoolEvents(receipt.blockNumber);
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

async function listenToPoolEvents(blockNumber) {
    const iface = new ethers.Interface([
      "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
      "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)"
    ]);
  
    const initLogs = await ethers.provider.getLogs({
      address: POOL_MANAGER,
      fromBlock: blockNumber,
      toBlock: blockNumber,
      topics: [iface.getEvent("Initialize").topicHash]
    });
  
    for (const log of initLogs) {
      const parsed = iface.parseLog(log);
      console.log("🆕 Pool Initialized:");
      console.log("   Pool ID:", parsed.args.id);
      console.log("   Token0:", parsed.args.currency0);
      console.log("   Token1:", parsed.args.currency1);
      console.log("   sqrtPriceX96:", parsed.args.sqrtPriceX96.toString());
      console.log("   tick:", parsed.args.tick.toString());
    }
  
    const modLogs = await ethers.provider.getLogs({
      address: POOL_MANAGER,
      fromBlock: blockNumber,
      toBlock: blockNumber,
      topics: [iface.getEvent("ModifyLiquidity").topicHash]
    });
  
    for (const log of modLogs) {
      const parsed = iface.parseLog(log);
      console.log("📥 Modify Liquidity:");
      console.log("   Pool ID:", parsed.args.id);
      console.log("   Sender:", parsed.args.sender);
      console.log("   Tick Range:", parsed.args.tickLower, "→", parsed.args.tickUpper);
      console.log("   Δ Liquidity:", parsed.args.liquidityDelta.toString());
      console.log("   Salt:", parsed.args.salt);
    }
  }
  
main().catch((err) => {
    console.error(err);
    process.exit(1);
});

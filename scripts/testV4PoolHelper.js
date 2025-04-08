// Description: Test script for V4PoolHelper.sol contract on Arbitrum mainnet and testnet fork
const { ethers, network } = require("hardhat");
require("dotenv").config();

const FORK_MAINNET = process.env.FORK_MAINNET;

//const MOCKTOKEN_ADDRESS = "0x845EbEa7A03D1eE7A3ab2C1AA1d93D0aaecfBd35"; // testnet token
//const MOCK_DEPLOYER = "0x179D189A7739d31Ba5a1839E3140958e20f1382e";
//const WETH_ADDRESS = FORK_MAINNET ? "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" : "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"; 
// const WETH_ABI = [
//   "function deposit() public payable",
//   "function approve(address spender, uint256 amount) public returns (bool)",
//   "function transfer(address recipient, uint256 amount) external returns (bool)",
//   "function balanceOf(address account) external view returns (uint256)"
// ];

const POOL_MANAGER = FORK_MAINNET ? "0x360e68faccca8ca495c1b759fd9eee466db9fb32" : "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317";
const POSITION_MANAGER = FORK_MAINNET ? "0xd88f38f930b7952f2db2432cb002e7abbf3dd869" : "0xAc631556d3d4019C95769033B5E719dD77124BAc";
const PERMIT2_ADDRESS = FORK_MAINNET ? "0x000000000022D473030F116dDEE9F6B43aC78BA3" : "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768";
const UNIVERSAL_ROUTER = FORK_MAINNET ? "0xa51afafe0263b40edaef0df8781ea9aa03e381a3" : "0xefd1d4bd4cf1e86da286bb4cb1b8bced9c10ba47";

let swapHelper, limToken;

async function main() {
    console.log("🚀 Starting script... FORK_MAINNET:", FORK_MAINNET);

    await network.provider.send("hardhat_reset", [{
        forking: {
        jsonRpcUrl: FORK_MAINNET ? "https://arb-mainnet.g.alchemy.com/v2/XNZLa2FrNs3uRaESVLHIb1XrNsUmpMmH" : "https://sepolia-rollup.arbitrum.io/rpc"
        }
    }]);

    const [owner, user1] = await ethers.getSigners();

    // Deploy PoolHelper
    const PoolHelper = await ethers.getContractFactory("V4PoolHelper");
    const poolHelper = await PoolHelper.deploy(POOL_MANAGER, POSITION_MANAGER, PERMIT2_ADDRESS);
    await poolHelper.waitForDeployment();
    console.log("✅ Deployed V4PoolHelper at", poolHelper.target);

    // Deploy SwapHelper
    const SwapHelper = await ethers.getContractFactory("V4SwapHelper");
    swapHelper = await SwapHelper.deploy(UNIVERSAL_ROUTER, POOL_MANAGER, PERMIT2_ADDRESS);
    await swapHelper.waitForDeployment();
    console.log("✅ Deployed V4SwapHelper at", swapHelper.target);

    // Deploy LiminalToken
    const LiminalToken = await ethers.getContractFactory("LiminalToken");
    limToken = await LiminalToken.deploy();
    await limToken.waitForDeployment();
    console.log("✅ Deployed LiminalToken at", limToken.target);

    //// Get WETH and MOCK contracts
    //const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, owner);
    //const mock = await ethers.getContractAt("IERC20", MOCKTOKEN_ADDRESS, owner);

    //// Impersonate deployer to transfer MOCK
    // await network.provider.request({ method: "hardhat_impersonateAccount", params: [MOCK_DEPLOYER] });
    // const mockDeployer = await ethers.getSigner(MOCK_DEPLOYER);
    // const mockFromDeployer = await ethers.getContractAt("IERC20", MOCKTOKEN_ADDRESS, mockDeployer);
    // await mockFromDeployer.transfer(owner.address, ethers.parseUnits("1000000", 18));
    // await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [MOCK_DEPLOYER] });
    // console.log("✅ Got 1M MOCK");

    //// Wrap ETH
    //await weth.deposit({ value: ethers.parseEther("100") });
    //console.log("✅ Wrapped 100 ETH");

    await poolHelper.setupPermit2Approvals(ethers.ZeroAddress, limToken.target);
    console.log("✅ Approved tokens to Permit2");

    const ethAmount = ethers.parseUnits("10", 18); // 10 ETH
    const limAmount = ethers.parseUnits("30000000", 18); // 30M LIM

    await limToken.transfer(poolHelper.target, limAmount);
    console.log(`✅ Transferred ${limAmount} LIM to PoolHelper`);

    //const allowance = await limToken.allowance(poolHelper.target, PERMIT2_ADDRESS);
    //console.log("LIM -> Permit2 allowance:", allowance.toString());

    const poolInput = {
        token0: ethers.ZeroAddress,
        token1: limToken.target,
        amount0: ethAmount,
        amount1: limAmount,
        fee: 300,
        tickSpacing: 60,
        tickLower: 148560,
        tickUpper: 149760,
        recipient: owner.address,
      };
    const tx = await poolHelper.createPoolAndAddLiquidity(poolInput, { value: ethAmount });
    const receipt = await tx.wait();
    console.log("✅ Pool initialized and liquidity added");

    const poolKey = {
      currency0: poolInput.token0,
      currency1: poolInput.token1,
      fee: poolInput.fee,
      tickSpacing: poolInput.tickSpacing,
      hooks: ethers.ZeroAddress
    };
    // const amountIn = ethers.parseUnits("0.1", 18);       // 0.1 ETH
    // const minAmountOut = ethers.parseUnits("0.2", 18);     // Minimum expected output in LIM
    // await swapHelper.swapExactInputSingle(poolKey, true, amountIn, minAmountOut, { value: amountIn });
    // console.log("✅ Successfully swapped!");

    await swap(poolKey, true, ethers.parseUnits("0.1", 18), user1); //swap 0.1 ETH
    await listenToPoolEvents(receipt.blockNumber);
}

// _zeroForOne = true for ETH -> LIM, false for LIM -> ETH
async function swap(_poolKey, _zeroForOne, _amountIn, _user) {
  const minAmountOut = ethers.parseUnits("0.2", 18);     // Minimum expected output in LIM
  const valueOfEth = _zeroForOne ? _amountIn : ethers.parseUnits("0", 18);
  await swapHelper.connect(_user).swapExactInputSingle(_poolKey, _zeroForOne, _amountIn, minAmountOut, { value: valueOfEth });
  console.log(`✅ Successfully swapped! ${_zeroForOne ? "ETH -> LIM" : "LIM -> ETH"}, amountIn: ${ethers.formatUnits(_amountIn, 18)}`);
  
  await log_TokenBalance(limToken, "LIM", _user.address, "User1");
  await log_EthBalance(_user.address, "User1");
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
  
    console.log("@_EVENT DATA:");

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

async function log_EthBalance(address, name) {
  let ethBalance = await ethers.provider.getBalance(address);
  console.log(`${name} ETH BALANCE: ${ethers.formatEther(ethBalance)}`);
}

async function log_TokenBalance(token, tokenName, userAddr, userName){
    let tokenBalance = await token.balanceOf(userAddr);
    console.log(`${userName} ${tokenName} BALANCE: ${ethers.formatEther(tokenBalance)}`);
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

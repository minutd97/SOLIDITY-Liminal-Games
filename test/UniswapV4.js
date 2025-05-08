const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
require("dotenv").config();

const FORK_MAINNET = process.env.FORK_MAINNET;
const POOL_MANAGER = FORK_MAINNET ? "0x360e68faccca8ca495c1b759fd9eee466db9fb32" : "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317";
const POSITION_MANAGER = FORK_MAINNET ? "0xd88f38f930b7952f2db2432cb002e7abbf3dd869" : "0xAc631556d3d4019C95769033B5E719dD77124BAc";
const PERMIT2_ADDRESS = FORK_MAINNET ? "0x000000000022D473030F116dDEE9F6B43aC78BA3" : "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768";
const UNIVERSAL_ROUTER = FORK_MAINNET ? "0xa51afafe0263b40edaef0df8781ea9aa03e381a3" : "0xefd1d4bd4cf1e86da286bb4cb1b8bced9c10ba47";

const POSITION_MANAGER_ABI = [
  {
    inputs: [
      { internalType: "bytes", name: "unlockData", type: "bytes" },
      { internalType: "uint256", name: "deadline", type: "uint256" }
    ],
    name: "modifyLiquidities",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "bytes[]", name: "data", type: "bytes[]" }
    ],
    name: "multicall",
    outputs: [
      { internalType: "bytes[]", name: "", type: "bytes[]" }
    ],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" }
    ],
    name: "balanceOf",
    outputs: [
      { internalType: "uint256", name: "", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" }
    ],
    name: "getPositionLiquidity",
    outputs: [
      { internalType: "uint128", name: "", type: "uint128" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" }
    ],
    name: "getPoolAndPositionInfo",
    outputs: [
      {
        components: [
          { internalType: "address", name: "currency0", type: "address" },
          { internalType: "address", name: "currency1", type: "address" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          { internalType: "int24", name: "tickSpacing", type: "int24" },
          { internalType: "address", name: "hooks", type: "address" }
        ],
        internalType: "struct PoolKey",
        name: "poolKey",
        type: "tuple"
      },
      {
        internalType: "uint256",
        name: "info",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "from", type: "address" },
      { indexed: true, internalType: "address", name: "to", type: "address" },
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" }
    ],
    name: "Transfer",
    type: "event"
  }
];

const PERMIT2_ABI = [
    // approve(token, spender, amount, expiration)
    {
      "inputs": [
        { "internalType": "address", "name": "token",    "type": "address"  },
        { "internalType": "address", "name": "spender",  "type": "address"  },
        { "internalType": "uint160", "name": "amount",   "type": "uint160"  },
        { "internalType": "uint48",  "name": "expiration","type": "uint48"   }
      ],
      "name": "approve",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    // allowance(owner, token, spender) → (amount, expiration, nonce)
    {
      "inputs": [
        { "internalType": "address", "name": "owner",   "type": "address" },
        { "internalType": "address", "name": "token",   "type": "address" },
        { "internalType": "address", "name": "spender", "type": "address" }
      ],
      "name": "allowance",
      "outputs": [
        { "internalType": "uint160", "name": "amount",     "type": "uint160" },
        { "internalType": "uint48",  "name": "expiration", "type": "uint48"  },
        { "internalType": "uint48",  "name": "nonce",      "type": "uint48"  }
      ],
      "stateMutability": "view",
      "type": "function"
    }
];
  
let limToken, swapHelper, hookAddress;

describe("Uniswap V4 Full test: Pool Creation, Swaps, Liquidity Providing and more", function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    // Deploy LIM Token
    const LiminalToken = await ethers.getContractFactory("LiminalToken");
    limToken = await LiminalToken.deploy();
    await limToken.waitForDeployment();

    // Deploy V4HookFactory
    const HookFactory = await ethers.getContractFactory("V4HookFactory");
    const hookFactory = await HookFactory.deploy();
    await hookFactory.waitForDeployment();

    const { salt, predicted, fullBytecode } = await findMatchingHookAddress(hookFactory.target, POOL_MANAGER);

    console.log("V4HookFactory @", hookFactory.target);
    console.log("Will deploy V4Hook ↦", predicted, "with salt", salt);
    
    // CREATE V4 Hook Contract
    const tx = await hookFactory.create(fullBytecode, salt);
    await tx.wait();
    console.log("✅ V4Hook deployed correctly:", predicted);
    hookAddress = predicted;

    // Deploy PoolHelper
    const PoolHelper = await ethers.getContractFactory("V4PoolHelper");
    const poolHelper = await PoolHelper.deploy(POOL_MANAGER, POSITION_MANAGER, PERMIT2_ADDRESS, predicted);
    await poolHelper.waitForDeployment();

    // DEV ONLY!!!!!!!!!!!!!!!!!!!!!!
    // Deploy SwapHelper
    const SwapHelper = await ethers.getContractFactory("V4SwapHelper");
    swapHelper = await SwapHelper.deploy(UNIVERSAL_ROUTER, POOL_MANAGER, PERMIT2_ADDRESS);
    await swapHelper.waitForDeployment();

    // Deploy LiminalPresale
    const LiminalPresale = await ethers.getContractFactory("LiminalPresale");
    const presale = await LiminalPresale.deploy(limToken.target, poolHelper.target);
    await presale.waitForDeployment();

    // Let the presale contract be the pool creator
    await poolHelper.grantCreatorRole(presale.target);

    const tokensForPool = ethers.parseUnits("35000000", 18); // 35 mil LIM
    await limToken.connect(owner).approve(presale.target, tokensForPool)
    await presale.connect(owner).depositPoolTokens(tokensForPool);

    const tokensForPresale = ethers.parseUnits("35000000", 18); // 35 mil LIM
    await limToken.connect(owner).approve(presale.target, tokensForPresale)
    await presale.connect(owner).depositPresaleTokens(tokensForPresale);

    await limToken.transfer(user1.address, ethers.parseUnits("70000000", 18));
    await log_TokenBalance(limToken, "LIM", user1.address, "user1");
    console.log("user 1 address : ", user1.address);

    return { owner, user1, user2, presale, poolHelper, hookAddress};
  }

it("should finalize and distribute tokens correctly + V4 Pool Creation + V4 Swap + V4 Liquidity Providing", async function () {
    const { owner, presale, user1, poolHelper} = await loadFixture(deployFixture);
    await presale.startPresale(3600); // 1-hour presale

    const ethValue = ethers.parseEther("0.5");
    const userCount = 14;
    for (let i = 0; i < userCount; i++) {
        const wallet = ethers.Wallet.createRandom().connect(ethers.provider);

        // Fund the wallet with ETH
        await owner.sendTransaction({
            to: wallet.address,
            value: ethValue + ethers.parseEther("0.12"),
        });

        await presale.connect(wallet).contribute({ value: ethValue });
        //console.log(`User ${i + 1} contributed ${ethValue} ETH`);
    }
    console.log(`${userCount} users contributed ${ethValue} ETH each.`);

    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine");

    await presale.endPresale();
    for (let i = 0; i < 1; i++){
        await presale.distributeTokens(100);
    }

    const tokensDistributed = await presale.tokensDistributed();
    console.log(`tokensDistributed : ${tokensDistributed}`);

    const totalPresaleTokens = await presale.totalPresaleTokens();
    expect(totalPresaleTokens).to.equal(0);

    await presale.createUniswapV4Pool();
    
    const totalPoolTokens = await presale.totalPoolTokens();
    expect(totalPoolTokens).to.equal(0);

    const totalContributions = await presale.totalContributions();
    expect(totalContributions).to.equal(0);

    //await testExactAmounts(poolHelper);
    await userMintsPosition(poolHelper, user1);
    await userIncreasesLiquidity(poolHelper, user1);
    await userCollectsPositionFees(poolHelper, user1);
    await userDecreasesLiquidity(poolHelper, user1);

    // For ERC20 SWAPS, Approve max tokens to Permit2, Permit2 approve max tokens to router
    await swapHelper.approveTokenWithPermit2(limToken.target);

    console.log("──────────── Swap Tests ─────────────");

    // Small swap
    await swap(true, ethers.parseEther("0.1"), user1); // Swap 0.1 ETH -> LIM

    // Medium swap
    await swap(true, ethers.parseEther("1.0"), user1); // Swap 1 ETH -> LIM

    // Larger swap
    await swap(true, ethers.parseEther("5.0"), user1); // Swap 5 ETH -> LIM

    // Now swap some LIM back to ETH
    await swap(false, ethers.parseUnits("100000", 18), user1); // Swap 100k LIM -> ETH
    await swap(false, ethers.parseUnits("500000", 18), user1); // Swap 500k LIM -> ETH

    console.log("──────────── End of Swap Tests ─────────────");

    await userCollectsPositionFees(poolHelper, user1);
    await userDecreasesLiquidity(poolHelper, user1);
    await userBurnPosition(poolHelper, user1);
  });
});

async function findMatchingHookAddress(factoryAddress, poolManagerAddress) {
  const factory = await ethers.getContractFactory("V4Hook");

  // build init code with the pool manager arg
  const encodedArgs  = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [poolManagerAddress]);
  const fullBytecode = factory.bytecode + encodedArgs.slice(2);
  const bytecodeHash = ethers.keccak256(fullBytecode);

  // <-- corrected mask includes the 1<<6 bit for afterSwap
  const expectedBits = BigInt((1<<12)|(1<<10)|(1<<8)|(1<<6)); // 0x1540n

  for (let salt = 0; salt < 1_000_000; salt++) {
    const saltHex   = ethers.toBeHex(salt, 32);
    const predicted = ethers.getCreate2Address(
      factoryAddress,  // <<< use the on-chain factory's address here
      saltHex,
      bytecodeHash
    );
    if ((BigInt(predicted) & 0x3FFFn) === expectedBits) {
      return { salt, predicted, fullBytecode };
    }
  }
  throw new Error("No matching address found");
}

// _zeroForOne = true for ETH -> LIM, false for LIM -> ETH
async function swap(_zeroForOne, _amountIn, _user) {
    const poolKey = {
        currency0: ethers.ZeroAddress,
        currency1: limToken.target,
        fee: 300,
        tickSpacing: 60,
        hooks: hookAddress
    };
  
    if(_zeroForOne == false){
        await limToken.connect(_user).approve(swapHelper.target, _amountIn);
        //console.log("✅ SWAP HELPER: Approved LIM tokens swap helper!");
    }

    const minAmountOut = ethers.parseUnits("0.00001", 18);     // Minimum expected output
    const valueOfEth = _zeroForOne ? _amountIn : ethers.parseUnits("0", 18);
    await swapHelper.connect(_user).swapExactInputSingle(poolKey, _zeroForOne, _amountIn, minAmountOut, { value: valueOfEth });
    console.log(`✅ Successfully swapped! ${_zeroForOne ? "ETH -> LIM" : "LIM -> ETH"}, amountIn: ${ethers.formatUnits(_amountIn, 18)}`);
    
    await log_TokenBalance(limToken, "LIM", _user.address, "User1");
    await log_EthBalance(_user.address, "User1");
}

async function userMintsPosition(poolHelper, user) {
  console.log("──────────── User Mints Position ─────────────");
  
  // 1) Instantiate PositionManager and Permit2 contracts connected to the user
  const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, user);
  const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, user);

  // 2) Define how much the user wants to deposit
  const [finalETH, finalLIM] = await poolHelper.getAmountsForExact(
      ethers.parseEther("3"), // ETH
      0
  );
    
  console.log("Exact amounts needed → ETH:", finalETH.toString(), "LIM:", finalLIM.toString());

  // 3a) Approve the ERC-20 itself so Permit2 can pull your LIM
  await limToken.connect(user).approve(PERMIT2_ADDRESS, ethers.parseUnits("20000000000", 18));
  //const erc20Allow = await limToken.allowance(user.address, PERMIT2_ADDRESS);
  //console.log("🛠 ERC20 → Permit2 allowance:", erc20Allow.toString());    

  // 3b) Approve Permit2
  const expiration = Math.floor(Date.now()/1000) + 60*60*24*365; // one year from now
  const MAX_ALLOW = (1n << 160n) - 1n; 
  await permit2.approve(limToken.target, POSITION_MANAGER, MAX_ALLOW, expiration);

  // Optional: read it back
  // const [amt, exp, nonce] = await permit2.allowance(user.address, limToken.target, POSITION_MANAGER);
  // console.log(`✅ Permit2: ${amt.toString()} LIM approved until ${exp.toString()} (nonce ${nonce.toString()})`);

  // 4) Build the PoolInput object expected by your helper
  const poolInput = {
    token0:     ethers.ZeroAddress,
    token1:     limToken.target,
    amount0:    finalETH,
    amount1:    finalLIM,
    fee:        300,
    tickSpacing:60,
    tickLower:  0,  // these are ignored by buildMintParamsForUser
    tickUpper:  0
  };

  // 5) Build the PoolInput and fetch the Uniswap call data
  const [ actions, params ] = await poolHelper.connect(user).buildMintParamsForUser(poolInput);

  // 6) Pack the inner encode for modifyLiquidities
  const inner = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes","bytes[]"],
      [ actions, params ]
  );
  const deadline = (await ethers.provider.getBlock("latest")).timestamp + 120;

  // 7) Now call multicall, *not* modifyLiquidities directly
  const callData = positionManager.interface.encodeFunctionData("modifyLiquidities", [ inner, deadline ]);
  const tx = await positionManager.connect(user).multicall([ callData ], { value: finalETH });
  const receipt = await tx.wait();
  const gasUsed = receipt.gasUsed;
  console.log(`✅ userMintPosition() completed, Gas Used in units: ${gasUsed}`);
  
  // 1) Define the event filter for Transfer(0x0 → user)
  const filter = positionManager.filters.Transfer(
    ethers.ZeroAddress,
    user.address
  );

  // 2) Query only the current block for matching events
  const events = await positionManager.queryFilter(
    filter,
    receipt.blockNumber,
    receipt.blockNumber
  );

  // 3) Pull out the last matching event (should be your mint)
  if (events.length === 0) {
    throw new Error("No mint Transfer event found");
  }
  const tokenId = events[events.length - 1].args.tokenId;
  console.log("🆔 Minted Position tokenId =", tokenId.toString());

  // 4) Store it on-chain
  await poolHelper.connect(user).storeTokenId(tokenId);
  console.log("✅ userMintPosition(): token ID stored");
  console.log("─────────────────────────────────────────────────");
}

async function userIncreasesLiquidity(poolHelper, user) {
  console.log("──────────── User Increases Liquidity ─────────────");

  const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, user);
  const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, user);

  // 1) Define additional liquidity amounts
  const [extraETH, extraLIM] = await poolHelper.getAmountsForExact(
      ethers.parseEther("0.05"), // target ETH
      0                          // set LIM to zero to indicate ETH-driven
  );

  console.log(`extraETH ${extraETH}, extraLIM ${extraLIM}`);

  // 2) Approve LIM if using LIM (skip if only using ETH)
  if (extraLIM > 0) {
      await limToken.connect(user).approve(PERMIT2_ADDRESS, ethers.parseUnits("20000000000", 18));
      const expiration = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
      const MAX_ALLOW = (1n << 160n) - 1n;
      await permit2.approve(limToken.target, POSITION_MANAGER, MAX_ALLOW, expiration);
  }

  // 3) Build calldata via the helper
  const [actions, params] = await poolHelper.connect(user)
      .buildIncreaseLiquidityParamsForUser(
          ethers.ZeroAddress,       // token0 (ETH)
          limToken.target,          // token1 (LIM)
          extraETH,                 // amount0 (ETH)
          extraLIM                  // amount1 (LIM)
      );

  const inner = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes", "bytes[]"],
      [actions, params]
  );
  const deadline = (await ethers.provider.getBlock("latest")).timestamp + 120;

  const callData = positionManager.interface.encodeFunctionData(
      "modifyLiquidities",
      [inner, deadline]
  );

  const tx = await positionManager.connect(user).multicall(
      [callData],
      { value: extraETH } // send ETH here
  );
  const receipt = await tx.wait();
  const gasUsed = receipt.gasUsed;
  console.log(`✅ userIncreasesLiquidity() completed, Gas Used in units: ${gasUsed}`);
  console.log("─────────────────────────────────────────────────");
}

async function userDecreasesLiquidity(poolHelper, user) {
  console.log("──────────── User Decreases Liquidity ─────────────");

  const positionManager = new ethers.Contract(
      POSITION_MANAGER,
      POSITION_MANAGER_ABI,
      user
  );

  // 1) Fetch the user’s tokenId & current liquidity via positionInfo
  const tokenId = await poolHelper.userTokenIds(user.address);
  let currentLiq = await positionManager.getPositionLiquidity(tokenId);
  currentLiq = currentLiq / 2n; // Take only half of the liquidity
  console.log("Current liquidity:", currentLiq.toString());

  // 2) Preview expected token returns for that full liquidity
  const [expected0, expected1] = await poolHelper.connect(user).previewAmountsForLiquidity(currentLiq);
  console.log(`Expected returns: token0=${expected0}, token1=${expected1}`);

  // Use bps = 10n; 0.1% slippage
  const bps = 1000n; // slippage
  const min0 = (expected0 * (10_000n - bps)) / 10_000n;
  const min1 = (expected1 * (10_000n - bps)) / 10_000n;

  console.log("minima :", min0.toString(),   min1.toString());

  // 3) Build calldata via the helper using those as minimums
  const [actions, params] = await poolHelper.connect(user)
      .buildDecreaseLiquidityParamsForUser(
          ethers.ZeroAddress,    // token0 (ETH)
          limToken.target,       // token1 (LIM)
          currentLiq,            // liquidity delta
          min0,             // min amount0
          min1              // min amount1
      );

  const inner = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes", "bytes[]"],
      [actions, params]
  );
  const block = await ethers.provider.getBlock("latest");
  const deadline = block.timestamp + 120;

  // 4) Execute via multicall
  const callData = positionManager.interface.encodeFunctionData(
      "modifyLiquidities",
      [inner, deadline]
  );

  const bal0Before = await ethers.provider.getBalance(user.address);
  const bal1Before = await limToken.balanceOf(user.address);

  const tx = await positionManager.connect(user).multicall([callData], { value: 0 });
  const receipt = await tx.wait();
  console.log(`✅ userDecreasesLiquidity() done, Gas Used: ${receipt.gasUsed}`);

  const bal0After = await ethers.provider.getBalance(user.address);
  const bal1After = await limToken.balanceOf(user.address);

  console.log(`token0 received: ${bal0After - bal0Before}`);
  console.log(`token1 received: ${bal1After - bal1Before}`);
  console.log("─────────────────────────────────────────────────");
}

async function userCollectsPositionFees(poolHelper, user) {
  console.log("──────────── User Collects Fees ─────────────");
  const positionManager = new ethers.Contract(
    POSITION_MANAGER,
    POSITION_MANAGER_ABI,
    user
  );

  // 1) prepare calldata via your new helper
  const [actions, params] = await poolHelper
    .connect(user)
    .buildCollectFeesParamsForUser(
      ethers.ZeroAddress,  // token0 (ETH)
      limToken.target      // token1 (LIM)
    );

  const inner = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "bytes[]"],
    [actions, params]
  );
  const block = await ethers.provider.getBlock("latest");
  const deadline = block.timestamp + 120;

  // 2) snapshot balances
  const ethBefore = await ethers.provider.getBalance(user.address);
  const limBefore = await limToken.balanceOf(user.address);

  // 3) call modifyLiquidities (collect fees)
  const tx = await positionManager
    .connect(user)
    .modifyLiquidities(inner, deadline, { value: 0 });
  const receipt = await tx.wait();
  console.log(`✅ userCollectsPositionFees() done, Gas Used: ${receipt.gasUsed}`);

  // 4) measure deltas
  const ethAfter = await ethers.provider.getBalance(user.address);
  const limAfter = await limToken.balanceOf(user.address);

  console.log("  ETH collected:", (ethAfter - ethBefore).toString());
  console.log("  LIM collected:", (limAfter - limBefore).toString());
  console.log("─────────────────────────────────────────────────");
}

async function userBurnPosition(poolHelper, user) {
  const positionManager = new ethers.Contract(
    POSITION_MANAGER,
    POSITION_MANAGER_ABI,
    user
  );

  const tokenId = await poolHelper.userTokenIds(user.address);
  console.log("— Burning position tokenId =", tokenId.toString());

  try {
    const owner = await positionManager.ownerOf(tokenId);
    console.log(`✅ Owner of tokenId ${tokenId} is: ${owner}`);
  } catch (e) {
    console.error(`❌ Could not fetch owner for tokenId ${tokenId}. Likely already burned or invalid.`);
    throw e;
  }

  const [actions, params] = await poolHelper
    .connect(user)
    .buildBurnPositionParamsForUser(
      ethers.ZeroAddress,      // token0 = ETH
      limToken.target,         // token1 = LIM
      0n,
      0n
    );

  const inner = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "bytes[]"],
    [actions, params]
  );
  const block = await ethers.provider.getBlock("latest");
  const deadline = block.timestamp + 120;

  const ethBefore = await ethers.provider.getBalance(user.address);
  const limBefore = await limToken.balanceOf(user.address);

  try {
    const tx = await positionManager.modifyLiquidities(inner, deadline);
    const receipt = await tx.wait();

    console.log("✅ burnPosition gasUsed:", receipt.gasUsed.toString());

    const ethAfter = await ethers.provider.getBalance(user.address);
    const limAfter = await limToken.balanceOf(user.address);

    console.log("ETH returned:", (ethAfter - ethBefore).toString());
    console.log("LIM returned:", (limAfter - limBefore).toString());
  } catch (err) {
    console.error("❌ burnPosition failed with:", err?.error?.message || err.message);
    throw err;
  }
}

async function testExactAmounts(poolHelper) {
    const cases = [
      // —— ETH‐driven (exact0 > 0)
      { label: "Tiny ETH (1 wei)",         exact0: 1n,                           exact1: 0n },
      { label: "Small ETH (0.0001)",       exact0: ethers.parseEther("0.0001"), exact1: 0n },
      { label: "Casual ETH (0.15)",        exact0: ethers.parseEther("0.15"),   exact1: 0n },
      { label: "1 ETH",                    exact0: ethers.parseEther("1.0"),    exact1: 0n },
      { label: "Large ETH (10 ETH)",       exact0: ethers.parseEther("10"),     exact1: 0n },
      { label: "Huge ETH (1000 ETH)",      exact0: ethers.parseEther("1000"),   exact1: 0n },
  
      // —— LIM‐driven (exact1 > 0)
      { label: "Tiny LIM (1 wei)",         exact0: 0n,                          exact1: 1n },
      { label: "Small LIM (0.0001 LIM)",   exact0: 0n,                          exact1: ethers.parseUnits("0.0001", 18) },
      { label: "Casual LIM (200 000)",     exact0: 0n,                          exact1: ethers.parseUnits("200000", 18) },
      { label: "1 000 000 LIM",            exact0: 0n,                          exact1: ethers.parseUnits("1000000",18) },
      { label: "Large LIM (10 000 000)",   exact0: 0n,                          exact1: ethers.parseUnits("10000000",18) },
  
      // —— Boundary mix (should error)
      { label: "Both zero (error)",        exact0: 0n,                          exact1: 0n },
      { label: "Both non-zero (error)",    exact0: ethers.parseEther("1.0"),   exact1: ethers.parseUnits("100000",18) },
    ];
  
    for (const { label, exact0, exact1 } of cases) {
      try {
        const [amount0, amount1] = await poolHelper.getAmountsForExact(exact0, exact1);
        console.log(
          `${label} → amount0: ${amount0.toString()} (~${ethers.formatEther(amount0)})  ` +
          `amount1: ${amount1.toString()} (~${ethers.formatUnits(amount1,18)})`
        );
      } catch (e) {
        console.log(`${label} → ❌ Error: ${e.reason || e.message}`);
      }
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

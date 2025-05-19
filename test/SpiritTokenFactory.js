const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
require("dotenv").config();

const FORK_MAINNET = process.env.FORK_MAINNET === "true";
const POOL_MANAGER = FORK_MAINNET ? "0x360e68faccca8ca495c1b759fd9eee466db9fb32" : "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317";
const POSITION_MANAGER = FORK_MAINNET ? "0xd88f38f930b7952f2db2432cb002e7abbf3dd869" : "0xAc631556d3d4019C95769033B5E719dD77124BAc";
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const UNIVERSAL_ROUTER = FORK_MAINNET ? "0xa51afafe0263b40edaef0df8781ea9aa03e381a3" : "0xefd1d4bd4cf1e86da286bb4cb1b8bced9c10ba47";
const CHAINLINK_PRICE_FEED = FORK_MAINNET ? "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612" : "0x694AA1769357215DE4FAC081bf1f309aDC325306";

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

let lim, swapHelper, hookAddress;

describe("Liminal Test Contracts: SpiritToken + Factory", function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    // Deploy LIM token (LiminalToken)
    const LiminalToken = await ethers.getContractFactory("LiminalToken");
    lim = await LiminalToken.deploy();
    await lim.waitForDeployment();

    // Deploy Spirit token
    const SpiritToken = await ethers.getContractFactory("SpiritToken");
    const spirit = await SpiritToken.deploy();
    await spirit.waitForDeployment();

    // Deploy V4HookFactory
    const HookFactory = await ethers.getContractFactory("V4HookFactory");
    const hookFactory = await HookFactory.deploy();
    await hookFactory.waitForDeployment();

    const { salt, predicted, fullBytecode } = await findMatchingHookAddress(hookFactory.target, POOL_MANAGER);

    console.log("V4HookFactory :", hookFactory.target);
    //console.log("Will deploy V4Hook ↦", predicted, "with salt", salt);
    
    // CREATE V4 Hook Contract
    const tx = await hookFactory.create(fullBytecode, salt);
    await tx.wait();
    hookAddress = predicted;
    console.log("V4Hook deployed correctly :", hookAddress);

    // Deploy PoolHelper
    const PoolHelper = await ethers.getContractFactory("V4PoolHelper");
    const poolHelper = await PoolHelper.deploy(POOL_MANAGER, POSITION_MANAGER, PERMIT2_ADDRESS, hookAddress);
    await poolHelper.waitForDeployment();
    console.log(`V4PoolHelper : ${poolHelper.target}`);

    // Deploy SwapHelper
    const SwapHelper = await ethers.getContractFactory("V4SwapHelper");
    swapHelper = await SwapHelper.deploy(UNIVERSAL_ROUTER, POOL_MANAGER, PERMIT2_ADDRESS);
    await swapHelper.waitForDeployment();
    console.log(`V4SwapHelper : ${swapHelper.target}`);

    // Deploy LiminalPresale
    const minEthRequiered = ethers.parseEther("7");
    const LiminalPresale = await ethers.getContractFactory("LiminalPresale");
    const presale = await LiminalPresale.deploy(lim.target, poolHelper.target, minEthRequiered);
    await presale.waitForDeployment();
    console.log(`LiminalPresale : ${presale.target}`);

    // Let the presale contract be the pool creator
    await poolHelper.grantCreatorRole(presale.target);

    const tokensForPool = ethers.parseUnits("35000000", 18); // 35 mil LIM
    await lim.connect(owner).approve(presale.target, tokensForPool)
    await presale.connect(owner).depositPoolTokens(tokensForPool);

    const tokensForPresale = ethers.parseUnits("35000000", 18); // 35 mil LIM
    await lim.connect(owner).approve(presale.target, tokensForPresale)
    await presale.connect(owner).depositPresaleTokens(tokensForPresale);

    await lim.transfer(user1.address, ethers.parseUnits("70000000", 18));
    await lim.transfer(user2.address, ethers.parseUnits("70000000", 18));

    // Uniswap V4 pool key
    const poolKey = {
        currency0: ethers.ZeroAddress,
        currency1: lim.target,
        fee: 5000,
        tickSpacing: 60,
        hooks: hookAddress
    };
    const poolId = getPoolId(poolKey);

    // Deploy Factory
    const SpiritTokenFactory = await ethers.getContractFactory("SpiritTokenFactory");
    const redeemFee = 100; // 1%
    const factory = await SpiritTokenFactory.deploy(
      spirit.target,
      lim.target,
      redeemFee,
      hookAddress,
      poolId,
      CHAINLINK_PRICE_FEED
    );
    await factory.waitForDeployment();

    // Grant minter role to factory
    await spirit.connect(owner).grantMinterRole(await factory.getAddress());
    await spirit.connect(owner).renounceAdmin();

    // Finish presale and create the pool
    const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, owner);
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

    const tx2 = await presale.createUniswapV4Pool();
    const receipt = await tx2.wait();
    const ownerTokenId = await returnTokenId(positionManager, poolHelper.target, receipt);

    await presale.connect(owner).transferPositionToHelper(POSITION_MANAGER, poolHelper.target, ownerTokenId);
    const ownerTokenAddress = await positionManager.ownerOf(ownerTokenId);
    console.log(`Owner token id : ${ownerTokenId}, address : ${ownerTokenAddress}`); 

    return { owner, user1, user2, lim, spirit, factory, redeemFee };
  }

  it("should correctly mint, redeem, and show dynamic pricing", async function () {
    const { owner, user1, lim, spirit, factory, redeemFee } = await loadFixture(deployFixture);

    // ===== 1. Mint SPIRIT with LIM using pool price =====
    const spiritAmount = ethers.parseUnits("100", 18); // 100 SPIRIT

    // // 30 dollars = 30 * 100 cents
    // const thirtyDollarsInCents = 30 * 100; // 3000

    // Get required LIM to mint (live pool price)
    let requiredLIM = await factory.getRequiredLIMForSpirit(spiritAmount);
    console.log(`Before swap to mint ${ethers.formatUnits(spiritAmount, 18)} SPIRIT, required LIM (by pool):`, ethers.formatUnits(requiredLIM, 18));

    //let limRequired = await factory.getRequiredLIMforUSD(thirtyDollarsInCents);
    //console.log("Before swap LIM required for $30:", ethers.formatUnits(limRequired, 18));

    let limFor30 = await factory.getRequiredLIMforUSD(30);
    console.log("LIM for $30:", ethers.formatUnits(limFor30, 18));

    // Larger swap
    await swap(true, ethers.parseEther("1.0"), user1); // Swap 5 ETH -> LIM

    requiredLIM = await factory.getRequiredLIMForSpirit(spiritAmount);
    //limRequired = await factory.getRequiredLIMforUSD(thirtyDollarsInCents);

    //console.log("After swap LIM required for $30:", ethers.formatUnits(limRequired, 18));
    console.log(`After swap to mint ${ethers.formatUnits(spiritAmount, 18)} SPIRIT, required LIM (by pool):`, ethers.formatUnits(requiredLIM, 18));

    limFor30 = await factory.getRequiredLIMforUSD(30);
    console.log("LIM for $30:", ethers.formatUnits(limFor30, 18));

    // Approve and mint
    await lim.connect(user1).approve(factory.getAddress(), requiredLIM);

    const userLIM_beforeMint = await lim.balanceOf(user1.address);
    await factory.connect(user1).mintSpirit(spiritAmount);
    const userLIM_afterMint = await lim.balanceOf(user1.address);
    const factoryLIM_afterMint = await lim.balanceOf(factory.getAddress());

    console.log("User LIM balance before mint:", ethers.formatUnits(userLIM_beforeMint, 18));
    console.log("User LIM balance after mint:", ethers.formatUnits(userLIM_afterMint, 18));
    console.log("Factory LIM balance after mint:", ethers.formatUnits(factoryLIM_afterMint, 18));
    console.log("User SPIRIT balance after mint:", ethers.formatUnits(await spirit.balanceOf(user1.address), 18));

    // ===== 2. Redeem SPIRIT for LIM (should subtract redeemFee) =====
    await spirit.connect(user1).approve(factory.getAddress(), spiritAmount);

    // Calculate expected payout at live pool price
    const limAmount = await factory.getRequiredLIMForSpirit(spiritAmount);
    const fee = (limAmount * BigInt(redeemFee)) / 10000n;
    const payout = limAmount - fee;

    console.log("Live LIM amount for redeeming 100 SPIRIT:", ethers.formatUnits(limAmount, 18));
    console.log("Redeem fee:", ethers.formatUnits(fee, 18));
    console.log("Payout to user:", ethers.formatUnits(payout, 18));

    const userLIM_beforeRedeem = await lim.balanceOf(user1.address);
    await factory.connect(user1).redeemSpirit(spiritAmount);
    const userLIM_afterRedeem = await lim.balanceOf(user1.address);

    console.log("User LIM balance before redeem:", ethers.formatUnits(userLIM_beforeRedeem, 18));
    console.log("User LIM balance after redeem:", ethers.formatUnits(userLIM_afterRedeem, 18));
    console.log("LIM received from redeem:", ethers.formatUnits(userLIM_afterRedeem - userLIM_beforeRedeem, 18));

    // ===== 3. Owner collects protocol fees =====
    const factoryLIMAfterRedeem = await lim.balanceOf(factory.getAddress());
    const protocolFees = await factory.collectedProtocolFees();

    console.log("Factory LIM after redeem:", ethers.formatUnits(factoryLIMAfterRedeem, 18));
    console.log("Protocol fees (should equal fee):", ethers.formatUnits(protocolFees, 18));

    const ownerLIM_before = await lim.balanceOf(owner.address);
    await factory.connect(owner).collectProtocolFees();
    const ownerLIM_after = await lim.balanceOf(owner.address);

    console.log("Owner LIM before fee collect:", ethers.formatUnits(ownerLIM_before, 18));
    console.log("Owner LIM after fee collect:", ethers.formatUnits(ownerLIM_after, 18));
    console.log("LIM received by owner (fees):", ethers.formatUnits(ownerLIM_after - ownerLIM_before, 18));

    // Protocol fees should now be zero
    const protocolFeesZero = await factory.collectedProtocolFees();
    console.log("Protocol fees after collection (should be zero):", protocolFeesZero.toString());
    expect(protocolFeesZero).to.equal(0);

    // ===== 4. Deposit to public reserve =====
    const depositAmount = ethers.parseUnits("1", 18);
    await lim.connect(user1).approve(factory.getAddress(), depositAmount);
    await factory.connect(user1).depositToPublicReserve(depositAmount);
    const publicReserve = await factory.publicProtocolReserve();
    console.log("Public reserve after deposit:", ethers.formatUnits(publicReserve, 18));

    // ===== 5. Confirm that the price is live from the Uniswap V4 pool =====
    const liveRequiredLIM = await factory.getRequiredLIMForSpirit(ethers.parseUnits("100", 18));
    console.log("Current required LIM to mint 100 SPIRIT (should match pool price):", ethers.formatUnits(liveRequiredLIM, 18));
    expect(liveRequiredLIM).to.be.gt(0);
  });
});

// _zeroForOne = true for ETH -> LIM, false for LIM -> ETH
async function swap(_zeroForOne, _amountIn, _user) {
    const poolKey = {
        currency0: ethers.ZeroAddress,
        currency1: lim.target,
        fee: 5000,
        tickSpacing: 60,
        hooks: hookAddress
    };
  
    if(_zeroForOne == false){
        await lim.connect(_user).approve(swapHelper.target, _amountIn);
        //console.log("✅ SWAP HELPER: Approved LIM tokens swap helper!");
    }

    const minAmountOut = ethers.parseUnits("0.00001", 18);     // Minimum expected output
    const valueOfEth = _zeroForOne ? _amountIn : ethers.parseUnits("0", 18);
    const tx = await swapHelper.connect(_user).swapExactInputSingle(poolKey, _zeroForOne, _amountIn, minAmountOut, { value: valueOfEth });
    const receipt = await tx.wait();

    let amountOut = null;

    // Filter logs only from the swapHelper contract
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== swapHelper.target.toLowerCase()) continue;

      try {
        const parsed = swapHelper.interface.parseLog(log);
        if (parsed.name === "SwapExecuted") {
          amountOut = parsed.args.amountOut;
          break;
        }
      } catch (e) {
        // skip non-matching logs
      }
    }

    if (!amountOut) {
      throw new Error("SwapExecuted event not found");
    }
    console.log(`✅ Successfully swapped! ${_zeroForOne ? "ETH -> LIM" : "LIM -> ETH"}, amountIn: ${ethers.formatUnits(_amountIn, 18)}, amountOut: ${ethers.formatUnits(amountOut, 18)}`);
    
    await log_TokenBalance(lim, "LIM", _user.address, "User1");
    await log_EthBalance(_user.address, "User1");
}

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

async function returnTokenId(positionManager, user, receipt) {
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
  var id = events[events.length - 1].args.tokenId;
  return id;
}

function getPoolId(poolKey) {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encoded = abiCoder.encode(
        [
            "address",   // currency0
            "address",   // currency1
            "uint24",    // fee
            "int24",     // tickSpacing
            "address"    // hooks
        ],
        [
            poolKey.currency0,
            poolKey.currency1,
            poolKey.fee,
            poolKey.tickSpacing,
            poolKey.hooks
        ]
    );

    const poolId = ethers.keccak256(encoded);
    console.log("PoolId:", poolId);
    return poolId;
}

async function log_EthBalance(address, name) {
    let ethBalance = await ethers.provider.getBalance(address);
    console.log(`${name} ETH BALANCE: ${ethers.formatEther(ethBalance)}`);
}
  
async function log_TokenBalance(token, tokenName, userAddr, userName){
    let tokenBalance = await token.balanceOf(userAddr);
    console.log(`${userName} ${tokenName} BALANCE: ${ethers.formatEther(tokenBalance)}`);
}

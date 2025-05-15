const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
require("dotenv").config();

const FORK_MAINNET = process.env.FORK_MAINNET === "true";
const POOL_MANAGER = FORK_MAINNET ? "0x360e68faccca8ca495c1b759fd9eee466db9fb32" : "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317";
const POSITION_MANAGER = FORK_MAINNET ? "0xd88f38f930b7952f2db2432cb002e7abbf3dd869" : "0xAc631556d3d4019C95769033B5E719dD77124BAc";
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
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
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" }
    ],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
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
let tokenId;
let tokenId2;

describe("LP Staking Rewards full test with Uniswap V4 pool created", function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    // Deploy LIM Token
    const LiminalToken = await ethers.getContractFactory("LiminalToken");
    limToken = await LiminalToken.deploy();
    await limToken.waitForDeployment();
    console.log(`LiminalToken : ${limToken.target}`);

    // Deploy V4HookFactory
    const HookFactory = await ethers.getContractFactory("V4HookFactory");
    const hookFactory = await HookFactory.deploy();
    await hookFactory.waitForDeployment();

    const { salt, predicted, fullBytecode } = await findMatchingHookAddress(hookFactory.target, POOL_MANAGER);

    console.log("V4HookFactory : ", hookFactory.target);
    //console.log("Will deploy V4Hook ↦", predicted, "with salt", salt);
    
    // CREATE V4 Hook Contract
    const tx = await hookFactory.create(fullBytecode, salt);
    await tx.wait();
    console.log("V4Hook deployed correctly : ", predicted);
    hookAddress = predicted;

    // Deploy PoolHelper
    const PoolHelper = await ethers.getContractFactory("V4PoolHelper");
    const poolHelper = await PoolHelper.deploy(POOL_MANAGER, POSITION_MANAGER, PERMIT2_ADDRESS, predicted);
    await poolHelper.waitForDeployment();
    console.log(`V4PoolHelper : ${poolHelper.target}`);

    // DEV ONLY!!!!!!!!!!!!!!!!!!!!!!
    // Deploy SwapHelper
    const SwapHelper = await ethers.getContractFactory("V4SwapHelper");
    swapHelper = await SwapHelper.deploy(UNIVERSAL_ROUTER, POOL_MANAGER, PERMIT2_ADDRESS);
    await swapHelper.waitForDeployment();
    console.log(`V4SwapHelper : ${swapHelper.target}`);

    // Deploy LiminalPresale
    const minEthRequiered = ethers.parseEther("7");
    const LiminalPresale = await ethers.getContractFactory("LiminalPresale");
    const presale = await LiminalPresale.deploy(limToken.target, poolHelper.target, minEthRequiered);
    await presale.waitForDeployment();
    console.log(`LiminalPresale : ${presale.target}`);

    // Deploy LPStakingRewards
    const LPStakingRewards = await ethers.getContractFactory("LPStakingRewards");
    const lpStakingRewards = await LPStakingRewards.deploy(limToken.target, POSITION_MANAGER);
    await lpStakingRewards.waitForDeployment();
    console.log(`LPStakingRewards : ${lpStakingRewards.target}`);

    // Let the presale contract be the pool creator
    await poolHelper.grantCreatorRole(presale.target);

    const tokensForPool = ethers.parseUnits("35000000", 18); // 35 mil LIM
    await limToken.connect(owner).approve(presale.target, tokensForPool)
    await presale.connect(owner).depositPoolTokens(tokensForPool);

    const tokensForPresale = ethers.parseUnits("35000000", 18); // 35 mil LIM
    await limToken.connect(owner).approve(presale.target, tokensForPresale)
    await presale.connect(owner).depositPresaleTokens(tokensForPresale);

    await limToken.transfer(user1.address, ethers.parseUnits("35000000", 18));
    await log_TokenBalance(limToken, "LIM", user1.address, "user1");

    await limToken.transfer(user2.address, ethers.parseUnits("35000000", 18));
    await log_TokenBalance(limToken, "LIM", user2.address, "user2");

    await limToken.approve(lpStakingRewards.target, ethers.parseUnits("35000000", 18));
    await lpStakingRewards.connect(owner).grantLoaderRole(owner.address);
    await lpStakingRewards.receiveRewardTokens(ethers.parseUnits("35000000", 18));

    return { owner, user1, user2, presale, poolHelper, hookAddress, lpStakingRewards};
  }

it("V4 Pool Creation + Liquidty providing", async function () {
    const { owner, presale, user1, user2, poolHelper, lpStakingRewards} = await loadFixture(deployFixture);
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

    const tx = await presale.createUniswapV4Pool();
    const receipt = await tx.wait();
    const ownerTokenId = await returnTokenId(positionManager, poolHelper.target, receipt);

    await presale.connect(owner).transferPositionToHelper(POSITION_MANAGER, poolHelper.target, ownerTokenId);
    const ownerTokenAddress = await positionManager.ownerOf(ownerTokenId);
    console.log(`Owner token id : ${ownerTokenId}, address : ${ownerTokenAddress}`);
    
    const totalPoolTokens = await presale.totalPoolTokens();
    expect(totalPoolTokens).to.equal(0);

    const totalContributions = await presale.totalContributions();
    expect(totalContributions).to.equal(0);

    await userMintsPosition(poolHelper, user1, ethers.parseEther("3"));
    await userMintsPosition(poolHelper, user2, ethers.parseEther("1.5"));

    // --- Stake user1 ---
    console.log("🔐 Staking tokenId for user1:", tokenId.toString());
    await positionManager.connect(user1).approve(lpStakingRewards.target, tokenId);
    await lpStakingRewards.connect(user1).stake(tokenId);
    const stake1 = await lpStakingRewards.stakes(tokenId);
    expect(stake1.staker).to.equal(user1.address);
    expect(stake1.liquidity).to.be.gt(0);
    console.log("✅ User1 staked with liquidity:", stake1.liquidity.toString());

    // --- Advance time by 2 weeks ---
    const twoWeeks = 2 * 7 * 24 * 60 * 60 + 1;
    await time.increase(twoWeeks);
    await ethers.provider.send("evm_mine");
    console.log("⏩ Time advanced by 2 weeks");

    // --- Stake user2 ---
    console.log("🔐 Staking tokenId2 for user2:", tokenId2.toString());
    await positionManager.connect(user2).approve(lpStakingRewards.target, tokenId2);
    await lpStakingRewards.connect(user2).stake(tokenId2);
    const stake2 = await lpStakingRewards.stakes(tokenId2);
    expect(stake2.staker).to.equal(user2.address);
    expect(stake2.liquidity).to.be.gt(0);
    console.log("✅ User2 staked with liquidity:", stake2.liquidity.toString());

    // --- Advance 1 more week ---
    const oneWeek = 7 * 24 * 60 * 60 + 1;
    await time.increase(oneWeek);
    await ethers.provider.send("evm_mine");
    console.log("⏩ Time advanced by 1 more week");

    // --- Check rewards for user1 (3 weeks staked) ---
    const [claimable1, burnable1] = await lpStakingRewards.getPending(tokenId);
    const total1 = claimable1 + burnable1;
    console.log("📊 USER1: claimable", ethers.formatUnits(claimable1, 18), "burnable", ethers.formatUnits(burnable1, 18));
    //expect(claimable1).to.be.closeTo(total1 / 10n, ethers.parseUnits("1", 18));
    //expect(burnable1).to.be.closeTo(total1 * 9n / 10n, ethers.parseUnits("1", 18));

    // --- Check rewards for user2 (1 week staked) ---
    const [claimable2, burnable2] = await lpStakingRewards.getPending(tokenId2);
    console.log("📊 USER2: claimable", ethers.formatUnits(claimable2, 18), "burnable", ethers.formatUnits(burnable2, 18));

    // --- Claim for user1 (should burn ~90%) ---
    // const balanceBefore1 = await limToken.balanceOf(user1.address);
    // await lpStakingRewards.connect(user1).claim(tokenId);
    // const balanceAfter1 = await limToken.balanceOf(user1.address);
    // const claimed1 = balanceAfter1 - balanceBefore1;
    // console.log("✅ USER1 claimed", ethers.formatUnits(claimed1, 18), "LIM");

    // expect(claimed1).to.be.closeTo(claimable1, ethers.parseUnits("20", 18));
    // expect(await lpStakingRewards.burnableRewards()).to.be.closeTo(burnable1, ethers.parseUnits("20", 18));

    // --- Advance another 2 weeks to pass 4-week decay ---
    const twoMoreWeeks = 2 * 7 * 24 * 60 * 60 + 1;
    await time.increase(twoMoreWeeks);
    await ethers.provider.send("evm_mine");
    console.log("⏩ Advanced 2 more weeks (user1 > 5w total staked)");

    // --- Query post-decay rewards ---
    const [claimablePost, burnablePost] = await lpStakingRewards.getPending(tokenId);
    console.log("📊 POST-DECAY USER1: claimable", ethers.formatUnits(claimablePost, 18), "burnable", ethers.formatUnits(burnablePost, 18));
    //expect(burnablePost).to.equal(0);

    const [claimablePost2, burnablePost2] = await lpStakingRewards.getPending(tokenId2);
    console.log("📊 POST-DECAY USER2: claimable", ethers.formatUnits(claimablePost2, 18), "burnable", ethers.formatUnits(burnablePost2, 18));

    // --- Unstake user2 (should auto-claim with burn) ---
    const balanceBeforeUser2 = await limToken.balanceOf(user2.address);
    await lpStakingRewards.connect(user2).unstake(tokenId2);
    const balanceAfterUser2 = await limToken.balanceOf(user2.address);
    const claimedUser2 = balanceAfterUser2 - balanceBeforeUser2;

    const postUnstake2 = await lpStakingRewards.stakes(tokenId2);
    expect(postUnstake2.staker).to.equal(ethers.ZeroAddress);
    console.log("🔓 USER2 unstaked successfully (after auto-claim)");
    console.log("✅ USER2 claimed", ethers.formatUnits(claimedUser2, 18), "LIM via unstake");

    // Validate claim amount is ~10% if still in decay
    if (burnablePost2 > 0n) {
        expect(claimedUser2).to.be.closeTo(claimablePost2, ethers.parseUnits("10", 18));
        expect(await lpStakingRewards.burnableRewards()).to.be.gte(burnablePost2);
    } else {
        expect(claimedUser2).to.equal(claimablePost2);
    }

    // --- Claim again (no burn now) ---
    const before2 = await limToken.balanceOf(user1.address);
    await lpStakingRewards.connect(user1).claim(tokenId);
    const after2 = await limToken.balanceOf(user1.address);
    const claimed2 = after2 - before2;
    console.log("✅ USER1 claimed full:", ethers.formatUnits(claimed2, 18), "LIM");

    expect(claimed2).to.be.closeTo(claimablePost, ethers.parseUnits("10", 18));

    // --- Unstake user1 ---
    await lpStakingRewards.connect(user1).unstake(tokenId);
    const postUnstake = await lpStakingRewards.stakes(tokenId);
    expect(postUnstake.staker).to.equal(ethers.ZeroAddress);
    console.log("🔓 USER1 unstaked successfully");

    // --- Burn accumulated ---
    const burnBefore = await lpStakingRewards.burnableRewards();
    console.log("🔥 Burnable:", ethers.formatUnits(burnBefore, 18), "LIM");
    expect(burnBefore).to.be.gt(0);

    await lpStakingRewards.connect(owner).burnAccumulated();
    const burnAfter = await lpStakingRewards.burnableRewards();
    console.log("✅ Burn executed. Remaining:", ethers.formatUnits(burnAfter, 18));
    expect(burnAfter).to.equal(0);
  });
});

async function userMintsPosition(poolHelper, user, ethAmount) {
  console.log("──────────── User Mints Position ─────────────");
  
  // 1) Instantiate PositionManager and Permit2 contracts connected to the user
  const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, user);
  const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, user);

  // 2) Define how much the user wants to deposit
  const [finalETH, finalLIM] = await poolHelper.getAmountsForExact(
      ethAmount, // ETH
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
    fee:        5000,
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
  
  if(tokenId == null){
    tokenId = await returnTokenId(positionManager, user, receipt);   
    console.log("🆔 Minted Position tokenId =", tokenId.toString());
  }
  else{
    tokenId2 = await returnTokenId(positionManager, user, receipt);   
    console.log("🆔 Minted Position tokenId =", tokenId2.toString());
  }
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

async function log_EthBalance(address, name) {
    let ethBalance = await ethers.provider.getBalance(address);
    console.log(`${name} ETH BALANCE: ${ethers.formatEther(ethBalance)}`);
  }
  
async function log_TokenBalance(token, tokenName, userAddr, userName){
    let tokenBalance = await token.balanceOf(userAddr);
    console.log(`${userName} ${tokenName} BALANCE: ${ethers.formatEther(tokenBalance)}`);
}

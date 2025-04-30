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
      "inputs": [
        { "internalType": "bytes",   "name": "unlockData", "type": "bytes"   },
        { "internalType": "uint256", "name": "deadline",   "type": "uint256" }
      ],
      "name": "modifyLiquidities",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "bytes[]", "name": "data", "type": "bytes[]" }
      ],
      "name": "multicall",
      "outputs": [
        { "internalType": "bytes[]", "name": "results", "type": "bytes[]" }
      ],
      "stateMutability": "payable",
      "type": "function"
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
  
let limToken, swapHelper;

describe("Uniswap V4 Full test: Pool Creation, Swaps, Liquidity Providing and more", function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    // Deploy LIM Token
    const LiminalToken = await ethers.getContractFactory("LiminalToken");
    limToken = await LiminalToken.deploy();
    await limToken.waitForDeployment();

    // Deploy PoolHelper
    const PoolHelper = await ethers.getContractFactory("V4PoolHelper");
    const poolHelper = await PoolHelper.deploy(POOL_MANAGER, POSITION_MANAGER, PERMIT2_ADDRESS);
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

    return { owner, user1, user2, presale, poolHelper};
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

    await testExactAmounts(poolHelper);
    await userMintsPosition(poolHelper, user1);

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
  });
});

// _zeroForOne = true for ETH -> LIM, false for LIM -> ETH
async function swap(_zeroForOne, _amountIn, _user) {
    const poolKey = {
        currency0: ethers.ZeroAddress,
        currency1: limToken.target,
        fee: 300,
        tickSpacing: 60,
        hooks: ethers.ZeroAddress
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
    console.log("user address in userMintsPosition : ", user.address);
    
    // 1) Instantiate PositionManager and Permit2 contracts connected to the user
    const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, user);
    const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, user);
  
    // 2) Define how much the user wants to deposit
    const [finalETH, finalLIM] = await poolHelper.getAmountsForExact(
        ethers.parseEther("0.15"), // ETH
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
    const callData = positionManager.interface.encodeFunctionData(
        "modifyLiquidities",
        [ inner, deadline ]
    );
    await positionManager
        .connect(user)
        .multicall(
            [ callData ],
            { value: finalETH }
    );

    console.log("✅ userMintPosition() completed");
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
  
async function testAllowedContribution(contract, buyer){
    const getAllowedContribution = await contract.getAllowedContribution(buyer);
    console.log(`getAllowedContribution : ${getAllowedContribution}`)
}

async function testRemainingTime(contract, timeToIncrease){
    await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
    await ethers.provider.send("evm_mine");
    
    const getRemainingTime = await contract.getRemainingTime();
    console.log(`getRemainingTime : ${getRemainingTime}`)
}

async function testGetterFunctions(contract){
    const minCapNotReached = await contract.minCapReached();
    console.log(`minCapNotReached : ${minCapNotReached}`)

    const buyersCount = await contract.getBuyersCount();
    console.log(`buyersCount : ${buyersCount}`)
}

async function log_EthBalance(address, name) {
    let ethBalance = await ethers.provider.getBalance(address);
    console.log(`${name} ETH BALANCE: ${ethers.formatEther(ethBalance)}`);
  }
  
async function log_TokenBalance(token, tokenName, userAddr, userName){
    let tokenBalance = await token.balanceOf(userAddr);
    console.log(`${userName} ${tokenName} BALANCE: ${ethers.formatEther(tokenBalance)}`);
}

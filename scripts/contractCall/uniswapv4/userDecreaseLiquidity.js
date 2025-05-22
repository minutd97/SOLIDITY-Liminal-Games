require("dotenv").config();
const { ethers } = require("hardhat");
const path = require("path");
const {
    getOwner,
    getProvider,
    sendTx,
    setTxLogging,
    log_TokenBalance,
    log_EthBalance
} = require(path.resolve(process.cwd(), "scripts/deployUtils"));
const {
    LIMINAL_TOKEN, 
    POSITION_MANAGER, 
    POSITION_MANAGER_ABI,
    V4_POOL_HELPER
} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const user = new ethers.Wallet(process.env.TESTNET_USER_PRIVATE_KEY, provider);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, user);
        const V4PoolHelper = await ethers.getContractAt("V4PoolHelper", V4_POOL_HELPER, user);
        
        // WE NEED TO KNOW THE POOL TOKEN ID!!!!
        const tokenId = 0;

        // 1) Instantiate PositionManager and Permit2 contracts connected to the user
        const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, user);

        // 1) Fetch the user’s tokenId & current liquidity via positionInfo
        let currentLiq = await positionManager.getPositionLiquidity(tokenId);
        currentLiq = currentLiq / 2n; // Take only half of the liquidity
        console.log("Current liquidity:", currentLiq.toString());
    
        // 2) Preview expected token returns for that full liquidity
        const [expected0, expected1] = await V4PoolHelper.connect(user).previewAmountsForLiquidity(currentLiq);
        console.log(`Expected returns: token0=${expected0}, token1=${expected1}`);
    
        // Use bps = 10n; 0.1% slippage
        const bps = 1000n; // slippage
        const min0 = (expected0 * (10_000n - bps)) / 10_000n;
        const min1 = (expected1 * (10_000n - bps)) / 10_000n;
    
        console.log("minima :", ethers.formatEther(min0), ethers.formatEther(min1));
    
        // 3) Build calldata via the helper using those as minimums
        const [actions, params] = await V4PoolHelper.connect(user).buildDecreaseLiquidityParamsForUser(
                ethers.ZeroAddress,    // token0 (ETH)
                LIMINAL_TOKEN,       // token1 (LIM)
                currentLiq,            // liquidity delta
                min0,             // min amount0
                min1,              // min amount1
                tokenId
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
        const bal1Before = await LiminalToken.balanceOf(user.address);
    
        const tx = await positionManager.connect(user).multicall([callData], { value: 0 });
        const receipt = await tx.wait();
        console.log(`✅ userDecreasesLiquidity() done, Gas Used: ${receipt.gasUsed}`);
    
        const bal0After = await ethers.provider.getBalance(user.address);
        const bal1After = await LiminalToken.balanceOf(user.address);
    
        console.log(`token0 received: ${ ethers.formatEther(bal0After - bal0Before) }`);
        console.log(`token1 received: ${ ethers.formatEther(bal1After - bal1Before) }`);

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
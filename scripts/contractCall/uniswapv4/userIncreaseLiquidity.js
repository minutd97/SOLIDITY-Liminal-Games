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
    PERMIT2_ADDRESS, 
    PERMIT2_ABI,
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
        const tokenId = 32;

        // 1) Instantiate PositionManager and Permit2 contracts connected to the user
        const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, user);
        const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, user);

        // 1) Define additional liquidity amounts
        const [extraETH, extraLIM] = await V4PoolHelper.getAmountsForExact(ethers.parseEther("0.0001"), 0);
        console.log(`extraETH ${ethers.formatEther(extraETH)}, extraLIM ${ethers.formatEther(extraLIM)}`);
      
        // 2) Approve LIM if using LIM (skip if only using ETH)
        if (extraLIM > 0) {
            await sendTx(LiminalToken.connect(user).approve(PERMIT2_ADDRESS, ethers.parseUnits("20000000000", 18)), "Approve the ERC-20 itself so Permit2 can pull your LIM");
            const expiration = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
            const MAX_ALLOW = (1n << 160n) - 1n;
            await sendTx(permit2.approve(LIMINAL_TOKEN, POSITION_MANAGER, MAX_ALLOW, expiration), "Approve approve to permit2");
        }
      
        // 3) Build calldata via the helper
        const [actions, params] = await V4PoolHelper.connect(user).buildIncreaseLiquidityParamsForUser(
                ethers.ZeroAddress,       // token0 (ETH)
                LIMINAL_TOKEN,          // token1 (LIM)
                extraETH,                 // amount0 (ETH)
                extraLIM,                 // amount1 (LIM)
                tokenId
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

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
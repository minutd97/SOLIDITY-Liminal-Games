require("dotenv").config();
const { ethers } = require("hardhat");
const path = require("path");
const {
    getOwner,
    getProvider,
    sendTx,
    setTxLogging,
    returnTokenId,
    log_TokenBalance,
    log_EthBalance
} = require(path.resolve(process.cwd(), "scripts/deployUtils"));
const {
    LIMINAL_TOKEN, 
    POSITION_MANAGER, 
    POSITION_MANAGER_ABI, 
    PERMIT2_ADDRESS, 
    PERMIT2_ABI,
    ERC721_ABI,
    V4_POOL_HELPER
} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const user = new ethers.Wallet(getOwner(), provider);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, user);
        const V4PoolHelper = await ethers.getContractAt("V4PoolHelper", V4_POOL_HELPER, user);
        
        // 1) Instantiate PositionManager and Permit2 contracts connected to the user
        const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, user);
        const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, user);

        // 2) Define how much the user wants to deposit
        const [finalETH, finalLIM] = await V4PoolHelper.getAmountsForExact(ethers.parseEther("0.1"), 0);
        console.log("Exact amounts needed → ETH:", ethers.formatEther(finalETH), "LIM:", ethers.formatEther(finalLIM));

        // 3a) Approve the ERC-20 itself so Permit2 can pull your LIM
        await LiminalToken.connect(user).approve(PERMIT2_ADDRESS, finalLIM);
        //const erc20Allow = await limToken.allowance(user.address, PERMIT2_ADDRESS);
        //console.log("🛠 ERC20 → Permit2 allowance:", erc20Allow.toString());    

        // 3b) Approve Permit2
        const expiration = Math.floor(Date.now()/1000) + 60*60*24*365; // one year from now
        const MAX_ALLOW = (1n << 160n) - 1n;
        await permit2.connect(user).approve(LIMINAL_TOKEN, POSITION_MANAGER, MAX_ALLOW, expiration);

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
        
        tokenId = await returnTokenId(positionManager, user, receipt);
        console.log("🆔 Minted Position tokenId =", tokenId.toString());

        // Send position to pool helper
        const erc721Transfer = new ethers.Contract(POSITION_MANAGER, ERC721_ABI, user);
        await sendTx(erc721Transfer.safeTransferFrom(user.address, V4_POOL_HELPER, tokenId), "Send position to pool helper");

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
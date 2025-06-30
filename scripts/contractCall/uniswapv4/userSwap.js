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
    V4_SWAP_HELPER,
    V4_HOOK
} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const user = new ethers.Wallet(process.env.TESTNET_USER_PRIVATE_KEY, provider);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, user);
        const V4SwapHelper = await ethers.getContractAt("V4SwapHelper", V4_SWAP_HELPER, user);

        const _zeroForOne = false; //true for ETH -> LIM, false for LIM -> ETH
        const _amountIn = ethers.parseEther("1515");

        const poolKey = {
            currency0: ethers.ZeroAddress,
            currency1: LIMINAL_TOKEN,
            fee: 5000,
            tickSpacing: 60,
            hooks: V4_HOOK
        };
        
        if(_zeroForOne == false){
            await sendTx(LiminalToken.connect(user).approve(V4_SWAP_HELPER, _amountIn), `Approve ${_amountIn} tokens`);
            //console.log("✅ SWAP HELPER: Approved LIM tokens swap helper!");
        }
    
        const minAmountOut = ethers.parseUnits("0.00001", 18);     // Minimum expected output
        const valueOfEth = _zeroForOne ? _amountIn : ethers.parseUnits("0", 18);
        const tx = await V4SwapHelper.connect(user).swapExactInputSingle(poolKey, _zeroForOne, _amountIn, minAmountOut, { value: valueOfEth });
        const receipt = await tx.wait();
    
        let amountOut = null;
    
        // Filter logs only from the V4SwapHelper contract
        for (const log of receipt.logs) {
            if (log.address.toLowerCase() !== V4SwapHelper.target.toLowerCase()) continue;
    
            try {
            const parsed = V4SwapHelper.interface.parseLog(log);
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
        
        await log_TokenBalance(LiminalToken, "LIM", user.address, "User1");
        await log_EthBalance(user.address, "User1");

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
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
        const tokenId = 32;

        // 1) Instantiate PositionManager and Permit2 contracts connected to the user
        const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, user);

        // 1) prepare calldata via your new helper
        const [actions, params] = await V4PoolHelper.connect(user).buildCollectFeesParamsForUser(
            ethers.ZeroAddress,  // token0 (ETH)
            LIMINAL_TOKEN,     // token1 (LIM)
            tokenId
        );
    
        const inner = ethers.AbiCoder.defaultAbiCoder().encode(
            ["bytes", "bytes[]"],
            [actions, params]
        );
        const block = await ethers.provider.getBlock("latest");
        const deadline = block.timestamp + 120;
    
        // 2) snapshot balances
        const ethBefore = await ethers.provider.getBalance(user.address);
        const limBefore = await LiminalToken.balanceOf(user.address);
    
        // 3) call modifyLiquidities (collect fees)
        const tx = await positionManager.connect(user).modifyLiquidities(inner, deadline, { value: 0 });
        const receipt = await tx.wait();
        console.log(`✅ userCollectsPositionFees() done, Gas Used: ${receipt.gasUsed}`);
    
        // 4) measure deltas
        const ethAfter = await ethers.provider.getBalance(user.address);
        const limAfter = await LiminalToken.balanceOf(user.address);
    
        console.log("ETH collected:", ethers.formatEther(ethAfter - ethBefore));
        console.log("LIM collected:", ethers.formatEther(limAfter - limBefore));

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
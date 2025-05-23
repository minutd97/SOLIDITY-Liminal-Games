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

        // try {
        //     const owner = await positionManager.ownerOf(tokenId);
        //     console.log(`✅ Owner of tokenId ${tokenId} is: ${owner}`);
        // } catch (e) {
        //     console.error(`❌ Could not fetch owner for tokenId ${tokenId}. Likely already burned or invalid.`);
        //     throw e;
        // }

        const [actions, params] = await V4PoolHelper.connect(user).buildBurnPositionParamsForUser(
            ethers.ZeroAddress,      // token0 = ETH
            LIMINAL_TOKEN,         // token1 = LIM
            0n,
            0n,
            tokenId
        );

        const inner = ethers.AbiCoder.defaultAbiCoder().encode(
            ["bytes", "bytes[]"],
            [actions, params]
        );
        const block = await ethers.provider.getBlock("latest");
        const deadline = block.timestamp + 120;

        const ethBefore = await ethers.provider.getBalance(user.address);
        const limBefore = await LiminalToken.balanceOf(user.address);

        try {
            const tx = await positionManager.modifyLiquidities(inner, deadline);
            const receipt = await tx.wait();

            console.log("✅ burnPosition gasUsed:", receipt.gasUsed.toString());

            const ethAfter = await ethers.provider.getBalance(user.address);
            const limAfter = await LiminalToken.balanceOf(user.address);

            console.log("ETH returned:", ethers.formatEther(ethAfter - ethBefore));
            console.log("LIM returned:", ethers.formatEther(limAfter - limBefore));
        } catch (err) {
            console.error("❌ burnPosition failed with:", err?.error?.message || err.message);
            throw err;
        }

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
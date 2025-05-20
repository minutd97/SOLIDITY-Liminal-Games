require("@nomicfoundation/hardhat-verify");
require("dotenv").config();
const { ethers } = require("hardhat");
const path = require("path");
const {
    getOwner,
    getProvider,
    deployContract,
    sendTx,
    setTxLogging,
    verifyContract,
    log_TokenBalance,
    log_EthBalance
} = require(path.resolve(process.cwd(), "scripts/deployUtils"));
const {LIMINAL_TOKEN, LIMINAL_TOKEN_DISTRIBUTOR, CHAINLINK_PRICE_FEED, V4_HOOK} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));
const IS_MAINNET = process.env.MAINNET_DEPLOY === "true";
let mockPriceAddress;

async function deploy() {
    try {
        setTxLogging(false);
        const provider = getProvider();
        const owner = new ethers.Wallet(getOwner(), provider);
        const LiminalDistributor = await ethers.getContractAt("LiminalDistributor", LIMINAL_TOKEN_DISTRIBUTOR, owner);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, owner);

        console.log("\n🚀 Deploying contracts...");
        console.log(`Contracts Owner : ${owner.address}`);

        // Deploy SpiritToken
        const spiritToken = await deployContract("SpiritToken", owner);

        if(!IS_MAINNET)
        {
            // Deploy MockChainlinkPriceFeed
            const mockPriceFeed = await deployContract("MockChainlinkPriceFeed", owner, [250000000000]); //ETH price is 2500$
            mockPriceAddress = mockPriceFeed.target;
        }

        // Uniswap V4 pool key
        const poolKey = {
            currency0: ethers.ZeroAddress,
            currency1: LIMINAL_TOKEN,
            fee: 5000,
            tickSpacing: 60,
            hooks: V4_HOOK
        };
        const poolId = getPoolId(poolKey);
    
        // Deploy SpiritTokenFactory
        const redeemFee = 100; // 1%
        const spiritTokenFactory = await deployContract("SpiritTokenFactory", owner, [
            spiritToken.target,
            LIMINAL_TOKEN,
            redeemFee,
            V4_HOOK,
            poolId,
            IS_MAINNET ? CHAINLINK_PRICE_FEED : mockPriceAddress
        ]);

        // Grant minter role to factory
        await sendTx(spiritToken.connect(owner).grantMinterRole(spiritTokenFactory.target), `Grant minter role to factory`);
        // We lose all the roles for fainess and to make sure tokens will be minted only from factory
        await sendTx(spiritToken.connect(owner).renounceAdmin(), `We lose all the roles for fainess and to make sure tokens will be minted only from factory`);

        // Deploy KNYRelayerVerifier
        const knyRelayerVerifier = await deployContract("KNYRelayerVerifier", owner, [owner.address]); // we need a trusted relayer wallet not the owner here

        // Deploy KaijiNoYurei
        const kaijiNoYurei = await deployContract("KaijiNoYurei", owner, [knyRelayerVerifier.target]);

        // Deploy GameTreasury
        const upfrontUnlocked = ethers.parseEther("5000000"); //5M LIM
        const totalAllocation = ethers.parseEther("75000000"); // 75M LIM
        const vestingDuration = 6 * 30 * 24 * 60 * 60;       // 6 months
        const gameTreasury = await deployContract("GameTreasury", owner, [LIMINAL_TOKEN, totalAllocation, upfrontUnlocked, vestingDuration]);

        // Grant Liminal Distributor as the pool loader
        await sendTx(gameTreasury.connect(owner).grantLoaderRole(LIMINAL_TOKEN_DISTRIBUTOR), `Grant Liminal Distributor as the pool loader`);

        // Register the GameTreasury contract in the distributor
        await sendTx(LiminalDistributor.connect(owner).setGameTreasury(gameTreasury.target), `Setting GameTreasury address in distributor`);

        await log_TokenBalance(LiminalToken, "LIM", LIMINAL_TOKEN_DISTRIBUTOR, "Distributor");
        // Then trigger the token distribution
        await sendTx(LiminalDistributor.connect(owner).distributeToGameTreasury(), `Distributing tokens to GameTreasury`);

        await log_TokenBalance(LiminalToken, "LIM", LIMINAL_TOKEN_DISTRIBUTOR, "Distributor");
    
        console.log("✅ After Presale Deployment Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ After Presale Deployment failed:", error);
        process.exit(1);
    }
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

deploy();

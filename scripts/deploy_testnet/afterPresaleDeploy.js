require("dotenv").config();
const { ethers } = require("hardhat");

const POOL_MANAGER = "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317";
const POSITION_MANAGER = "0xAc631556d3d4019C95769033B5E719dD77124BAc";
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const LIMINAL_TOKEN = "0x69dd60b4a7Bf521Dd7bFA1871FaB6C237191191d";
const LIMINAL_TOKEN_DISTRIBUTOR = "0x7c07edcB223c16d4b2fB373C476030c41f8027ae";

async function deploy() {
    try {
        const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545"); //process.env.ARBITRUM_TESTNET_PROV
        const owner = new ethers.Wallet(process.env.TESTNET_PRIVATE_KEY, provider);
        const LiminalDistributor = await ethers.getContractAt("LiminalDistributor", LIMINAL_TOKEN_DISTRIBUTOR, owner);
        
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, owner);
        const tokenName = await LiminalToken.name(); // ← this will fail if it's not a valid ERC20
        console.log(`Token Name : ${tokenName}`);

        console.log("🚀 Deploying contracts...");
        console.log(`Contracts Owner : ${owner.address}`);
        console.log(`________________________________________`);

        // Deploy GameTreasury
        const upfrontUnlocked = ethers.parseEther("5000000");
        const totalAllocation = ethers.parseEther("75000000");
        const GameTreasury = await ethers.getContractFactory("GameTreasury");
        const gameTreasury = await GameTreasury.deploy(LIMINAL_TOKEN, totalAllocation, upfrontUnlocked);
        await gameTreasury.waitForDeployment();
        console.log("GameTreasury :", gameTreasury.target);

        // Register the GameTreasury contract in the distributor
        await LiminalDistributor.connect(owner).setGameTreasury(gameTreasury.target);
        console.log("✅ GameTreasury address set in distributor.");

        await log_TokenBalance(LiminalToken, "LIM", LIMINAL_TOKEN_DISTRIBUTOR, "Distributor");
        // Then trigger the token distribution
        await LiminalDistributor.connect(owner).distributeToGameTreasury();
        console.log("✅ Tokens distributed to GameTreasury.");
        await log_TokenBalance(LiminalToken, "LIM", LIMINAL_TOKEN_DISTRIBUTOR, "Distributor");
    
        console.log(`________________________________________`);
        process.exit(0);
    } catch (error) {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    }
}

async function log_TokenBalance(token, tokenName, userAddr, userName){
    let tokenBalance = await token.balanceOf(userAddr);
    console.log(`${userName} ${tokenName} BALANCE: ${ethers.formatEther(tokenBalance)}`);
}

deploy();

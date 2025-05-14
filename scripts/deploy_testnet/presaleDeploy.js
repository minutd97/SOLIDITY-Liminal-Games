require("dotenv").config();
const { ethers } = require("hardhat");

const POOL_MANAGER = "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317";
const POSITION_MANAGER = "0xAc631556d3d4019C95769033B5E719dD77124BAc";
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

async function deploy() {
    try {
        const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545"); //process.env.ARBITRUM_TESTNET_PROV
        const owner = new ethers.Wallet(process.env.TESTNET_PRIVATE_KEY, provider);

        console.log("🚀 Deploying contracts...");
        console.log(`Contracts Owner : ${owner.address}`);
        console.log(`________________________________________`);

        // Deploy LIM Token
        const LiminalToken = await ethers.getContractFactory("LiminalToken", owner);
        const limToken = await LiminalToken.deploy();
        await limToken.waitForDeployment();
        console.log("LiminalToken :", limToken.target);
    
        // Deploy V4HookFactory
        const HookFactory = await ethers.getContractFactory("V4HookFactory", owner);
        const hookFactory = await HookFactory.deploy();
        await hookFactory.waitForDeployment();
        console.log("V4HookFactory :", hookFactory.target);
        
        // CREATE V4 Hook Contract
        const { salt, predicted, fullBytecode } = await findMatchingHookAddress(hookFactory.target, POOL_MANAGER);
        const tx = await hookFactory.create(fullBytecode, salt);
        await tx.wait();
        console.log("V4Hook deployed correctly :", predicted);
    
        // Deploy PoolHelper
        const PoolHelper = await ethers.getContractFactory("V4PoolHelper", owner);
        const poolHelper = await PoolHelper.deploy(POOL_MANAGER, POSITION_MANAGER, PERMIT2_ADDRESS, predicted);
        await poolHelper.waitForDeployment();
        console.log("V4PoolHelper :", poolHelper.target);
    
        // Deploy LiminalPresale
        const minEthRequiered = ethers.parseEther("0.5");
        const LiminalPresale = await ethers.getContractFactory("LiminalPresale", owner);
        const presale = await LiminalPresale.deploy(limToken.target, poolHelper.target, minEthRequiered);
        await presale.waitForDeployment();
        console.log("LiminalPresale :", presale.target);
        // Let the presale contract be the pool creator
        await poolHelper.connect(owner).grantCreatorRole(presale.target);

        // Deposit tokens to Liminal Presale Contract
        const tokensForPool = ethers.parseUnits("35000000", 18); // 35 mil LIM
        await limToken.connect(owner).approve(presale.target, tokensForPool)
        await presale.connect(owner).depositPoolTokens(tokensForPool);
    
        const tokensForPresale = ethers.parseUnits("35000000", 18); // 35 mil LIM
        await limToken.connect(owner).approve(presale.target, tokensForPresale)
        await presale.connect(owner).depositPresaleTokens(tokensForPresale);
        //console.log(`✅ Tokens deposited to Liminal Presale Contract`);

        // Deploy LiminalDistributor and transfer 230M LIM to distributor
        const totalAmount = ethers.parseEther("230000000"); // 230M
        const Distributor = await ethers.getContractFactory("LiminalDistributor", owner);
        const distributor = await Distributor.deploy(limToken.target);
        await distributor.waitForDeployment();
        console.log(`LiminalDistributor : ${distributor.target}`);
        await limToken.transfer(distributor.target, totalAmount);
    
        // Deploy LongTermReserve and transfer 30M LIM to reserve
        const LongTermReserve = await ethers.getContractFactory("LongTermReserve", owner);
        const reserve_upfront = ethers.parseEther("10000000"); // 10M
        const reserve_total = ethers.parseEther("30000000");   // 30M
        const reserve_cliff = 30 * 24 * 60 * 60;               // 1 month
        const reserve_duration = 3 * 30 * 24 * 60 * 60;       // 3 months
        const reserve = await LongTermReserve.deploy(
            limToken.target,
            owner.address,
            reserve_upfront,
            reserve_total,
            reserve_cliff,
            reserve_duration
        );
        await reserve.waitForDeployment();
        console.log(`LongTermReserve : ${reserve.target}`);
        await limToken.transfer(reserve.target, reserve_total); // Fund the reserve with the full 30M LIM

        // Deploy AirdropDistributor and transfer 10M LIM to airdrop
        const airdrop_reserves = ethers.parseEther("10000000"); // 10M
        const airdrop_cliff = 30 * 24 * 60 * 60; // 30 days
        const airdrop_duration = 182 * 24 * 60 * 60; // aprox. 6 months
        const Airdrop = await ethers.getContractFactory("AirdropDistributor", owner);
        const airdrop = await Airdrop.deploy(await limToken.getAddress(), airdrop_reserves, airdrop_cliff, airdrop_duration);
        await airdrop.waitForDeployment();
        console.log(`AirdropDistributor : ${airdrop.target}`);
        await limToken.transfer(await airdrop.getAddress(), airdrop_reserves);

        // Deploy TeamVestingController
        const VestingController = await ethers.getContractFactory("TeamVestingController", owner);
        const vestingController = await VestingController.deploy();
        await vestingController.waitForDeployment();
        console.log(`TeamVestingController : ${vestingController.target}`);

        // Deploy TeamVestingVault
        const VestingVault = await ethers.getContractFactory("TeamVestingVault", owner);
        const vestingVault = await VestingVault.deploy(await vestingController.getAddress());
        await vestingVault.waitForDeployment();
        console.log(`TeamVestingVault : ${vestingVault.target}`);

        // Grant funder role for vault and deployer
        await vestingController.grantFunderRole(vestingVault.target);
        await vestingController.grantFunderRole(owner.address);

        // Fund initial vesting wallets
        const vesting_block = await ethers.provider.getBlock("latest");
        const vesting_start = vesting_block.timestamp;
        const vesting_duration = 365 * 24 * 60 * 60; // 12 months
        const vesting_cliff = 30 * 24 * 60 * 60; // 1 month
        const vesting_beneficiary_half = ethers.parseEther("15000000"); // 15M
    
        const beneficiary1 = "0xD580273B481c6acb42eB979DF6a369eB657B1CE9";
        const beneficiary2 = "0x4921A22EFe83c87E2e6135565A797F5914FB931E";

        for (const beneficiary of [beneficiary1, beneficiary2]) {
            console.log("\nCreating vesting wallet for:", beneficiary);
            const tx = await vestingController.createVestingWallet(
                beneficiary,
                vesting_start,
                vesting_duration,
                vesting_cliff,
                vestingVault.target
            );
            await tx.wait();
    
            console.log(`Funding wallet with ${vesting_beneficiary_half} LIM`);
            await limToken.approve(vestingController.target, vesting_beneficiary_half);
            await vestingController.connect(owner).fundERC20ToWallet(beneficiary, limToken.target, vesting_beneficiary_half);
        }

        // Fund the vesting with the remaining token reserve with a linear realease
        const vesting_vault_reserve = ethers.parseEther("30000000"); // 30M
        const secondsInYear = 365 * 24 * 60 * 60;
        const vault_ratePerSecond = vesting_vault_reserve / BigInt(secondsInYear); // 30M tokens over 365 days (18 decimals)
        await vestingVault.setERC20ReleaseRate(await limToken.getAddress(), vault_ratePerSecond);
        await limToken.approve(vestingVault.target, vesting_vault_reserve);
        await limToken.transfer(vestingVault.target, vesting_vault_reserve);

        console.log(`________________________________________`);
        await log_TokenBalance(limToken, "LIM", owner.address, "Owner");
        process.exit(0);
    } catch (error) {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
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

async function log_TokenBalance(token, tokenName, userAddr, userName){
    let tokenBalance = await token.balanceOf(userAddr);
    console.log(`${userName} ${tokenName} BALANCE: ${ethers.formatEther(tokenBalance)}`);
}

deploy();

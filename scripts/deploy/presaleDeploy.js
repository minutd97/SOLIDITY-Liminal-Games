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
const {POOL_MANAGER, POSITION_MANAGER, PERMIT2_ADDRESS} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function deploy() {
    try {
        setTxLogging(false);
        const provider = getProvider();
        const owner = new ethers.Wallet(getOwner(), provider);

        console.log("\n🚀 Deploying contracts...");
        console.log(`Contracts Owner : ${owner.address}`);

        // Deploy LIM Token
        const limToken = await deployContract("LiminalToken", owner);

        // Deploy V4HookFactory
        const hookFactory = await deployContract("V4HookFactory", owner);
        
        // CREATE V4 Hook Contract
        const { salt, predicted, fullBytecode } = await findMatchingHookAddress(hookFactory.target, POOL_MANAGER);
        // This will auto-await tx + wait
        await sendTx(hookFactory.create(fullBytecode, salt), "Create V4 Hook");
        console.log("✅ V4Hook deployed correctly :", predicted);
    
        // Deploy PoolHelper
        const poolHelper = await deployContract("V4PoolHelper", owner, [POOL_MANAGER, POSITION_MANAGER, PERMIT2_ADDRESS, predicted]);
    
        // Deploy LiminalPresale
        const minEthRequiered = ethers.parseEther("0.5");
        const presale = await deployContract("LiminalPresale", owner, [limToken.target, poolHelper.target, minEthRequiered]);
        // Let the presale contract be the pool creator
        await sendTx(poolHelper.connect(owner).grantCreatorRole(presale.target), "Grant pool creator role for presale contract");

        // Deposit tokens to Liminal Presale Contract
        const tokensForPool = ethers.parseUnits("35000000", 18); // 35 mil LIM
        const tokensForPresale = ethers.parseUnits("35000000", 18); // 35 mil LIM
        await sendTx(limToken.connect(owner).approve(presale.target, tokensForPool + tokensForPresale), "Approve total amount of tokens to presale contract");
        await sendTx(presale.connect(owner).depositPoolTokens(tokensForPool), "Deposit pool tokens for uniswap v4 pool");
        await sendTx(presale.connect(owner).depositPresaleTokens(tokensForPresale), "Deposit presale tokens for users");

        // Deploy LiminalDistributor and transfer 230M LIM to distributor
        const totalAmount = ethers.parseEther("230000000"); // 230M
        const distributor = await deployContract("LiminalDistributor", owner, [limToken.target]);
        await sendTx(limToken.transfer(distributor.target, totalAmount),
         `Fund the LiminalDistributor with ${ethers.formatEther(totalAmount)} LIM in total`);

        // Deploy LongTermReserve and transfer 30M LIM to reserve
        const reserve_upfront = ethers.parseEther("5000000"); // 5M
        const reserve_total = ethers.parseEther("30000000");   // 30M
        const reserve_cliff = 900;//30 * 24 * 60 * 60;               // 1 month
        const reserve_duration = 3 * 30 * 24 * 60 * 60;       // 3 months
        const reserve = await deployContract("LongTermReserve", owner, [limToken.target, owner.address, reserve_upfront, reserve_total, reserve_cliff, reserve_duration]);
        await sendTx(limToken.transfer(reserve.target, reserve_total),
         `Fund the LongTermReserve with ${ethers.formatEther(reserve_total)} LIM in total`);

        // Deploy AirdropDistributor and transfer 10M LIM to airdrop
        const airdrop_reserves = ethers.parseEther("10000000"); // 10M
        const airdrop_cliff = 900;//30 * 24 * 60 * 60; // 30 days
        const airdrop_duration = 182 * 24 * 60 * 60; // aprox. 6 months
        const airdrop = await deployContract("AirdropDistributor", owner, [limToken.target, airdrop_reserves, airdrop_cliff, airdrop_duration]);
        await sendTx(limToken.transfer(airdrop.target, airdrop_reserves),
         `Fund the AirdropDistributor with ${ethers.formatEther(airdrop_reserves)} LIM in total`);

        // Deploy TeamVestingController
        const vestingController = await deployContract("TeamVestingController", owner);

        // Deploy TeamVestingVault
        const vestingVault = await deployContract("TeamVestingVault", owner, [vestingController.target]);

        // Set vault address to controller
        await sendTx(vestingController.setVaultAddress(vestingVault.target), `Set vault address to controller`);

        // Grant funder role for vault and deployer
        await sendTx(vestingController.grantFunderRole(vestingVault.target), `Grant funder role for TeamVestingVault`);
        await sendTx(vestingController.grantFunderRole(owner.address), `Grant funder role for contract Owner`);

        // Fund initial vesting wallets
        const vesting_duration = 365 * 24 * 60 * 60; // 12 months
        const vesting_cliff = 900;//30 * 24 * 60 * 60; // 1 month
        const vesting_beneficiary_half = ethers.parseEther("10000000"); // 10M
    
        const beneficiary1 = "0xD580273B481c6acb42eB979DF6a369eB657B1CE9";
        const beneficiary2 = "0x4921A22EFe83c87E2e6135565A797F5914FB931E";

        for (const beneficiary of [beneficiary1, beneficiary2]) {
            console.log("\nCreating vesting wallet for:", beneficiary);
            await sendTx(vestingController.createVestingWallet(
                beneficiary,
                vesting_duration,
                vesting_cliff
            ), `Creating vesting wallet for: ${beneficiary}`);
    
            await sendTx(limToken.approve(vestingController.target, vesting_beneficiary_half),
             `Approve LIM tokens ${ethers.formatEther(vesting_beneficiary_half)} to TeamVestingController`);

            await sendTx(vestingController.connect(owner).fundERC20ToWallet(beneficiary, limToken.target, vesting_beneficiary_half),
             `Fund beneficiary : ${beneficiary} , with LIM tokens ${ethers.formatEther(vesting_beneficiary_half)}`);

            console.log(`Funded beneficiary : ${beneficiary} with LIM tokens ${ethers.formatEther(vesting_beneficiary_half)}`);
        }

        // Fund the vesting with the remaining token reserve with a linear realease
        const vesting_vault_reserve_upfront = ethers.parseEther("10000000"); // 10M
        const vesting_vault_reserve = ethers.parseEther("30000000"); // 30M
        const secondsInYear = 365 * 24 * 60 * 60;
        const vault_ratePerSecond = vesting_vault_reserve / BigInt(secondsInYear); // 30M tokens over 365 days (18 decimals)
        await sendTx(vestingVault.connect(owner).setERC20ReleaseRate(limToken.target, vault_ratePerSecond, vesting_vault_reserve_upfront),
         `Set the ERC20 release rate for ${limToken.target}`);

        const totalVaultReserves = vesting_vault_reserve + vesting_vault_reserve_upfront;
        await sendTx(limToken.approve(vestingVault.target, totalVaultReserves), `Approve ${ethers.formatEther(totalVaultReserves)} LIM tokens to TeamVestingVault`);
        await sendTx(limToken.transfer(vestingVault.target, totalVaultReserves), `Transfer ${ethers.formatEther(totalVaultReserves)} LIM tokens to TeamVestingVault`);

        await log_TokenBalance(limToken, "LIM", owner.address, "Owner");
        console.log("✅ Presale Deployment Succeded !");

        console.log("Verifying contracts...")
        await verifyContract(limToken.target);
        await verifyContract(presale.target, [limToken.target, poolHelper.target, minEthRequiered]);
        await verifyContract(distributor.target, [limToken.target]);
        await verifyContract(reserve.target, [limToken.target, owner.address, reserve_upfront, reserve_total, reserve_cliff, reserve_duration]);
        await verifyContract(airdrop.target, [limToken.target, airdrop_reserves, airdrop_cliff, airdrop_duration]);
        await verifyContract(vestingController.target);
        await verifyContract(vestingVault.target, [vestingController.target]);
        process.exit(0);
    } catch (error) {
        console.error("❌ Presale Deployment failed:", error);
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

deploy();

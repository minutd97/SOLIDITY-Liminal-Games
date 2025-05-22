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
    LP_STAKING_REWARDS
} = require(path.resolve(process.cwd(), "scripts/deployAddresses"));

async function execute() {
    try {
        setTxLogging(true);
        const provider = getProvider();
        const owner = new ethers.Wallet(getOwner(), provider);
        const LiminalToken = await ethers.getContractAt("LiminalToken", LIMINAL_TOKEN, owner);
        const LPStakingRewards = await ethers.getContractAt("LPStakingRewards", LP_STAKING_REWARDS, owner);

        const burnBefore = await LPStakingRewards.burnableRewards();
        console.log("🔥 Executing final burn:", ethers.formatUnits(burnBefore, 18), "LIM");

        await sendTx(LPStakingRewards.connect(owner).burnAccumulated(), `Owner burns ${burnBefore} from lp staking rewards`);

        const burnAfter = await LPStakingRewards.burnableRewards();
        console.log("✅ Burn executed. Remaining:", ethers.formatUnits(burnAfter, 18));

        console.log("✅ Execution Succeded !");
        process.exit(0);
    } catch (error) {
        console.error("❌ Execution failed:", error);
        process.exit(1);
    }
}

execute();
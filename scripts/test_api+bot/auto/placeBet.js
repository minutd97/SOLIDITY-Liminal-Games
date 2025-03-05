const { ethers } = require("hardhat");
require("dotenv").config();

async function randomWalletPlaceBet(gameId, playerBetOn) {
    const provider = new ethers.JsonRpcProvider(process.env.LOCAL_RPC);
    provider.pollingInterval = 100;
    
    const KNY_BET = process.env.KNY_BET;
    const knyBet = await ethers.getContractAt("KNYBet", KNY_BET, provider);

    // Create new player wallet
    const wallet = ethers.Wallet.createRandom().connect(provider);
    //console.log(`🆕 New player created: ${wallet.address}`);

    // Fund wallet with some ETH
    await fundWallet(wallet);

    await knyBet.connect(wallet).placeBet(gameId, playerBetOn); // gameId, playerBetOn
    console.log(`✅ Bet Placed: ID ${gameId}, BetOn: ${playerBetOn}`);

    async function fundWallet(wallet) {
        const funder = new ethers.Wallet(process.env.HARDHAT_WALLETFUNDER_PRIVATE_KEY, provider); // Use private key
    
        const tx = await funder.sendTransaction({
            to: wallet.address,
            value: ethers.parseEther("0.1"),
        });
    
        await tx.wait();
        //console.log(`✅ Wallet ${wallet.address} funded with 0.1 ETH`);
    }
}

//randomWalletPlaceBet();
module.exports = randomWalletPlaceBet;
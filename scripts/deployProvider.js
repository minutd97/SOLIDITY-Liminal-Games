require("dotenv").config();
const { ethers } = require("hardhat");

function getProvider() {
    return new ethers.JsonRpcProvider(
        process.env.REAL_DEPLOY
            ? (process.env.MAINNET_DEPLOY
                ? process.env.ARBITRUM_MAINNET_PROV
                : process.env.ARBITRUM_TESTNET_PROV)
            : "http://127.0.0.1:8545"
    );
}

module.exports = {
    getProvider
};
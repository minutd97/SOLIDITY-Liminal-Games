require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require("hardhat-tracer");
require("dotenv").config();

const FORK_MAINNET = process.env.FORK_MAINNET === "true";

module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: false,
      evmVersion: "cancun" // ✅ THIS is the fix
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        url: FORK_MAINNET ? process.env.ARBITRUM_MAINNET_PROV : process.env.ARBITRUM_TESTNET_PROV,
        //blockNumber: 321922670,
      },
      chainId: 31337,
      // mining: {
      //   auto: true,
      //   interval: [3000, 5000],
      // },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      forking: {
        url: FORK_MAINNET ? process.env.ARBITRUM_MAINNET_PROV : process.env.ARBITRUM_TESTNET_PROV,
        // blockNumber: 321922670
      },
      // mining: {
      //   auto: false,
      //   interval: [3000, 5000],
      // },
    },
    arbitrumOne: {
      url: process.env.ARBITRUM_MAINNET_PROV,
      accounts: [`0x${process.env.MAINNET_PRIVATE_KEY}`],
    },
    arbitrumSepolia: {
      url: process.env.ARBITRUM_TESTNET_PROV,
      accounts: [`0x${process.env.TESTNET_PRIVATE_KEY}`],
    },
  },
  etherscan: {
    apiKey: "5DFVXNNZ7GK7V13XDKSJIW5FGXXJY2HQ32",
  },
  gasReporter: {
    enabled: true,
    currency: "ETH",
    gasPrice: 0.024,
  },
  mocha: {
    bail: true,
    timeout: 0,
  },
  tracing: true,
};
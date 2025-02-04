require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require("hardhat-tracer");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200 // You can adjust this number
      },
      viaIR: false
    }
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      // forking: {
      //   url: "https://arb1.arbitrum.io/rpc"
      // },
      chainId: 31337 // 0x7A69 hexadecimal
    },
    arbitrumOne: {
      url: 'https://arb1.arbitrum.io/rpc',  // Arbitrum One RPC URL
      accounts: [`0x${process.env.PRIVATE_KEY}`]
    },
    arbitrumSepolia: {
      url: 'https://sepolia-rollup.arbitrum.io/rpc',  // Arbitrum Sepolia RPC URL
      accounts: [`0x${process.env.PRIVATE_KEY}`]
    }
  },
  etherscan: {
    apiKey: "5DFVXNNZ7GK7V13XDKSJIW5FGXXJY2HQ32", // Replace with your Arbitrum Sepolia Etherscan API key
  },
  paths: {
      artifacts: "./artifacts"
  },
  gasReporter: {
    enabled: true,
    currency: "ETH",
    gasPrice: 0.024, // Set Arbitrum gas price in Gwei
  }
};
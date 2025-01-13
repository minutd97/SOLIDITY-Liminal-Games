require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require("hardhat-tracer");

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
      forking: {
        url: "https://arb1.arbitrum.io/rpc" //https://arb1.arbitrum.io/rpc
      },
      chainId: 31337 // 0x7A69 hexadecimal
    },
    arbitrumOne: {
      url: 'https://arb1.arbitrum.io/rpc',  // Arbitrum One RPC URL
      accounts: [`0x1d9673a3f1c469e3ae63daa3659649d282fd11e5e34b95275f2a8276ab29f7d1`]  // Your wallet private key
    },
    arbitrumSepolia: {
      url: 'https://sepolia-rollup.arbitrum.io/rpc',  // Arbitrum Sepolia RPC URL
      accounts: [`0x1d9673a3f1c469e3ae63daa3659649d282fd11e5e34b95275f2a8276ab29f7d1`]  // Your wallet private key
    }
  },
  etherscan: {
    apiKey: "5DFVXNNZ7GK7V13XDKSJIW5FGXXJY2HQ32", // Replace with your Arbitrum Sepolia Etherscan API key
  },
  paths: {
      artifacts: "./artifacts"
  },
  gasReporter: {
    enabled: (process.env.REPORT_GAS) ? true : false,
    currency: 'USD',
    showTimeSpent: true,
  }
};
require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require("hardhat-tracer");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: false,
    },
  },

  defaultNetwork: "hardhat",

  networks: {
    hardhat: {
      forking: {
        url: "https://arb-mainnet.g.alchemy.com/v2/XNZLa2FrNs3uRaESVLHIb1XrNsUmpMmH",
        blockNumber: 321922670,
      },
      chainId: 31337,
      mining: {
        auto: true,
        interval: [3000, 5000],
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    arbitrumOne: {
      url: "https://arb1.arbitrum.io/rpc",
      accounts: [`0x${process.env.MAINNET_PRIVATE_KEY}`],
    },
    arbitrumSepolia: {
      url: "https://sepolia-rollup.arbitrum.io/rpc",
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

  // // ✅ Aliases for internal v4-periphery Permit2 files
  // paths: {
  //   sources: "./contracts",
  // },
  // moduleAlias: {
  //   aliases: {
  //     "permit2": path.resolve(__dirname, "node_modules/@uniswap/v4-periphery/lib/permit2/src"),
  //   },
  // },
};
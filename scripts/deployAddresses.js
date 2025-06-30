require("dotenv").config();

const IS_MAINNET = process.env.MAINNET_DEPLOY === "true";
const POSITION_MANAGER_ABI = [
  {
    inputs: [
      { internalType: "bytes", name: "unlockData", type: "bytes" },
      { internalType: "uint256", name: "deadline", type: "uint256" }
    ],
    name: "modifyLiquidities",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "bytes[]", name: "data", type: "bytes[]" }
    ],
    name: "multicall",
    outputs: [
      { internalType: "bytes[]", name: "", type: "bytes[]" }
    ],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" }
    ],
    name: "balanceOf",
    outputs: [
      { internalType: "uint256", name: "", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" }
    ],
    name: "getPositionLiquidity",
    outputs: [
      { internalType: "uint128", name: "", type: "uint128" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" }
    ],
    name: "getPoolAndPositionInfo",
    outputs: [
      {
        components: [
          { internalType: "address", name: "currency0", type: "address" },
          { internalType: "address", name: "currency1", type: "address" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          { internalType: "int24", name: "tickSpacing", type: "int24" },
          { internalType: "address", name: "hooks", type: "address" }
        ],
        internalType: "struct PoolKey",
        name: "poolKey",
        type: "tuple"
      },
      {
        internalType: "uint256",
        name: "info",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "from", type: "address" },
      { indexed: true, internalType: "address", name: "to", type: "address" },
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" }
    ],
    name: "Transfer",
    type: "event"
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" }
    ],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
];
const PERMIT2_ABI = [
    // approve(token, spender, amount, expiration)
    {
      "inputs": [
        { "internalType": "address", "name": "token",    "type": "address"  },
        { "internalType": "address", "name": "spender",  "type": "address"  },
        { "internalType": "uint160", "name": "amount",   "type": "uint160"  },
        { "internalType": "uint48",  "name": "expiration","type": "uint48"   }
      ],
      "name": "approve",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    // allowance(owner, token, spender) → (amount, expiration, nonce)
    {
      "inputs": [
        { "internalType": "address", "name": "owner",   "type": "address" },
        { "internalType": "address", "name": "token",   "type": "address" },
        { "internalType": "address", "name": "spender", "type": "address" }
      ],
      "name": "allowance",
      "outputs": [
        { "internalType": "uint160", "name": "amount",     "type": "uint160" },
        { "internalType": "uint48",  "name": "expiration", "type": "uint48"  },
        { "internalType": "uint48",  "name": "nonce",      "type": "uint48"  }
      ],
      "stateMutability": "view",
      "type": "function"
    }
];
const ERC721_ABI = [
    "function safeTransferFrom(address from, address to, uint256 tokenId) external",
];

module.exports = {
    CHAINLINK_PRICE_FEED: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", // Mainnet only!!! For testnet MockChainlinkPriceFeed deploy is requiered!!!
    POOL_MANAGER: IS_MAINNET ? "0x498581ff718922c3f8e6a244956af099b2652b2b" : "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408",
    POSITION_MANAGER: IS_MAINNET ? "0x7c5f5a4bbd8fd63184577525326123b519429bdc" : "0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80",
    POSITION_MANAGER_ABI: POSITION_MANAGER_ABI,
    UNIVERSAL_ROUTER: IS_MAINNET ? "0x6ff5693b99212da76ad316178a184ab56d299b43" : "0x492e6456d9528771018deb9e87ef7750ef184104",
    PERMIT2_ADDRESS: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    PERMIT2_ABI: PERMIT2_ABI,
    ERC721_ABI: ERC721_ABI,

    LIMINAL_TOKEN: IS_MAINNET ? "0x7Aed7e8DB7b9284A8f99c52c592cC38215d9A13C" : "0x24afD564E8ffd64227B172FE2EB72F61264e0c53",
    V4_POOL_HELPER: IS_MAINNET ? "0x1cD7147E9Aa455641fcb4ed929fD96AdEd7685C6" : "0x6Bb28c572B2DF77ac4CD9663Ba237024f83E0b2C",
    V4_SWAP_HELPER: IS_MAINNET ? "0xa7180035039F38a38D4c6BFEbf5Ce0a052F80fB8" : "0xA272da1f5A30ddC3F6EDFFAF3F9a1d0171110669",
    V4_HOOK: IS_MAINNET ? "0xdc5db2c2A069c32548877C4baA11894B7C7a83a3" : "0x1A6B26cFC6fd4BB3c77AE02B529b257fD0E9D540",
    LIMINAL_PRESALE: IS_MAINNET ? "0x53f080267Fdd2Afe00fc5AD12a5446aFD9eFf680" : "0xb839aE2e0217Aae116D1E7c4EF16B0AC050423f1",
    LIMINAL_TOKEN_DISTRIBUTOR: IS_MAINNET ? "0x7BA420F73F8B11218FA7E3e4B569163D5f24B6C7" : "0x3004752Feba3a2Fa35058667db95283783E2b93B",
    AIRDROP: IS_MAINNET ? "" : "0xf58F4D9d0e96b72806a4aB6c8D8149c21CF31Cf9",
    LONG_TERM_RESERVE: IS_MAINNET ? "" : "0xf4Fc5EECb27e9513a5D67D675087946112CB867E",
    TEAM_VESTING_CONTROLLER: IS_MAINNET ? "" : "0x81c067D0E586ABd41Fc51F6AE416395E9Df4aE5A",
    TEAM_VESTING_VAULT: IS_MAINNET ? "" : "0x0E995e1c84dd800bC733962806f78Ed4B2249244",
    GAME_TREASURY: IS_MAINNET ? "" : "0x5704163f351A38bcd44d5Bc5DD2C2E64aDc07851",
    SPIRIT_TOKEN: IS_MAINNET ? "" : "0xcbB6951DC3Ae703A6F547d525f090B7937bC85a2",
    SPIRIT_TOKEN_FACTORY: IS_MAINNET ? "" : "0xe9940c198Dc9968A67d50a707bD162B71BddB7D2",
    LIMINAL_STAKING_POOL: IS_MAINNET ? "" : "0x0a032AE0626a242Eaf1bCc087B95186607c5d493",
    LP_STAKING_REWARDS: IS_MAINNET ? "" : "0xdEC0e2C2d14391b17CF2f78b140eE952f8071AB2",

    KNY_RELAYER_VERIFIER: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    KNY_BET: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    KAIJI_NO_YUREI: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
};

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
    POOL_MANAGER: IS_MAINNET ? "0x360e68faccca8ca495c1b759fd9eee466db9fb32" : "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317",
    POSITION_MANAGER: IS_MAINNET ? "0xd88f38f930b7952f2db2432cb002e7abbf3dd869" : "0xAc631556d3d4019C95769033B5E719dD77124BAc",
    POSITION_MANAGER_ABI: POSITION_MANAGER_ABI,
    UNIVERSAL_ROUTER: IS_MAINNET ? "0xa51afafe0263b40edaef0df8781ea9aa03e381a3" : "0xefd1d4bd4cf1e86da286bb4cb1b8bced9c10ba47",
    PERMIT2_ADDRESS: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    PERMIT2_ABI: PERMIT2_ABI,
    ERC721_ABI: ERC721_ABI,

    LIMINAL_TOKEN: IS_MAINNET ? "" : "0xD58e0e746752dC9c918D2147415aDBb53198c98b",
    V4_POOL_HELPER: IS_MAINNET ? "" : "0x7d11f0a08eeEb9BdE50ed68db5d0Ca63d54be712",
    V4_SWAP_HELPER: IS_MAINNET ? "" : "0x7c8e4Ef9D24Fa4F85D355638EA48b8f0AD05Db59",
    V4_HOOK: IS_MAINNET ? "" : "0x1ab8C6860e3f3F1cC5F4617eAB7E481f640d1540",
    LIMINAL_PRESALE: IS_MAINNET ? "" : "0xdD577A98dD75A2d57af39680524dBCFf071FB9C4",
    LIMINAL_TOKEN_DISTRIBUTOR: IS_MAINNET ? "" : "0x597809d00E516DfdDE327F53C44afA9FaF287639",
    AIRDROP: IS_MAINNET ? "" : "0x32ff70CC3406e30cF6B495638fba6946Db6297dF",
    LONG_TERM_RESERVE: IS_MAINNET ? "" : "0x0734F289cd0F79cdd21900177f119517538caeb9",
    TEAM_VESTING_CONTROLLER: IS_MAINNET ? "" : "0x17b85ddf7B7E3F1F54EBEDAaD8eDb37c771a741E",
    TEAM_VESTING_VAULT: IS_MAINNET ? "" : "0x8BB4D1c0c810C3EA3aE3a68C496c2e3455852F15",
    GAME_TREASURY: IS_MAINNET ? "" : "0x5704163f351A38bcd44d5Bc5DD2C2E64aDc07851",
    SPIRIT_TOKEN: IS_MAINNET ? "" : "0xcbB6951DC3Ae703A6F547d525f090B7937bC85a2",
    SPIRIT_TOKEN_FACTORY: IS_MAINNET ? "" : "0xe9940c198Dc9968A67d50a707bD162B71BddB7D2",
    LIMINAL_STAKING_POOL: IS_MAINNET ? "" : "0x0a032AE0626a242Eaf1bCc087B95186607c5d493",
    LP_STAKING_REWARDS: IS_MAINNET ? "" : "0xdEC0e2C2d14391b17CF2f78b140eE952f8071AB2",

    KNY_RELAYER_VERIFIER: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    KNY_BET: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    KAIJI_NO_YUREI: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
};

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
    POOL_MANAGER: IS_MAINNET ? "0x360e68faccca8ca495c1b759fd9eee466db9fb32" : "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317",
    POSITION_MANAGER: IS_MAINNET ? "0xd88f38f930b7952f2db2432cb002e7abbf3dd869" : "0xAc631556d3d4019C95769033B5E719dD77124BAc",
    POSITION_MANAGER_ABI: POSITION_MANAGER_ABI,
    UNIVERSAL_ROUTER: IS_MAINNET ? "0xa51afafe0263b40edaef0df8781ea9aa03e381a3" : "0xefd1d4bd4cf1e86da286bb4cb1b8bced9c10ba47",
    PERMIT2_ADDRESS: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    PERMIT2_ABI: PERMIT2_ABI,
    ERC721_ABI: ERC721_ABI,

    LIMINAL_TOKEN: IS_MAINNET ? "" : "",
    V4_POOL_HELPER: IS_MAINNET ? "" : "",
    V4_SWAP_HELPER: IS_MAINNET ? "" : "",
    LIMINAL_PRESALE: IS_MAINNET ? "" : "",
    LIMINAL_TOKEN_DISTRIBUTOR: IS_MAINNET ? "" : "",
    AIRDROP: IS_MAINNET ? "" : "",
    LONG_TERM_RESERVE: IS_MAINNET ? "" : "",
    TEAM_VESTING_CONTROLLER: IS_MAINNET ? "" : "",
    TEAM_VESTING_VAULT: IS_MAINNET ? "" : "",
    GAME_TREASURY: IS_MAINNET ? "" : "",
    SPIRIT_TOKEN: IS_MAINNET ? "" : "",
    SPIRIT_TOKEN_FACTORY: IS_MAINNET ? "" : "",

    KNY_RELAYER_VERIFIER: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    KNY_BET: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    KAIJI_NO_YUREI: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
};

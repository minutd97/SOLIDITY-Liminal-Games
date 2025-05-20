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
    CHAINLINK_PRICE_FEED: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", // Mainnet only!!! For testnet MockChainlinkPriceFeed deploy is requiered!!!
    POOL_MANAGER: IS_MAINNET ? "0x360e68faccca8ca495c1b759fd9eee466db9fb32" : "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317",
    POSITION_MANAGER: IS_MAINNET ? "0xd88f38f930b7952f2db2432cb002e7abbf3dd869" : "0xAc631556d3d4019C95769033B5E719dD77124BAc",
    POSITION_MANAGER_ABI: POSITION_MANAGER_ABI,
    UNIVERSAL_ROUTER: IS_MAINNET ? "0xa51afafe0263b40edaef0df8781ea9aa03e381a3" : "0xefd1d4bd4cf1e86da286bb4cb1b8bced9c10ba47",
    PERMIT2_ADDRESS: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    PERMIT2_ABI: PERMIT2_ABI,
    ERC721_ABI: ERC721_ABI,

    LIMINAL_TOKEN: IS_MAINNET ? "0x0ae7C6989862798BCEF5C95647a1ABef4F11bCc8" : "0xC6ac39aAcAca29CBbeD979c8b4aA819e284102f8",
    V4_POOL_HELPER: IS_MAINNET ? "0xbCcdF479Cd45A36A875abB952f62c47430eA5c47" : "0xb2dC9049612D5c1c96d3db505E14222AEc4B9C97",
    V4_SWAP_HELPER: IS_MAINNET ? "0xCb5958f87F840FbF015e4b838677FBcD70f02D95" : "0x4B98087D6153aDe7Ae8d4dC2C74c6285b871997F",
    V4_HOOK: IS_MAINNET ? "0x1cd2cc34d349520BA7944830d81d43D449AF1540" : "0x73305FFD9e8d00D112656CaD0C2d2064C2ed9540",
    LIMINAL_PRESALE: IS_MAINNET ? "0xDB544459EeBf51Ee30D45C278D0b1a8C628C7947" : "0x7d11f0a08eeEb9BdE50ed68db5d0Ca63d54be712",
    LIMINAL_TOKEN_DISTRIBUTOR: IS_MAINNET ? "0xb9509372d8229bF00d7283709ae1Ca5355b86C73" : "0x59ddC96B764b55736F6cC586aa3339F39BFC28F6",
    AIRDROP: IS_MAINNET ? "0xdb6d9c538ebb02c551E02e47Be971a226b77b534" : "0x88ED656d775b274247731a8A31438fe1ce94393c",
    LONG_TERM_RESERVE: IS_MAINNET ? "0x0E8aD62C468E6614C21E63a1cc24578e83254A5B" : "0xB301B0bb8B1229a695C3A2e839bF65626440915a",
    TEAM_VESTING_CONTROLLER: IS_MAINNET ? "0x41247b7b9a77Ed7b75F3D541017a7246d2d79D65" : "0x653bB470029a3C334eA0567efA0D5b1ddE145074",
    TEAM_VESTING_VAULT: IS_MAINNET ? "0x0Ba7b52Ab46AF21F723B29b49f952B115F9fc075" : "0x32ff70CC3406e30cF6B495638fba6946Db6297dF",
    GAME_TREASURY: IS_MAINNET ? "" : "",
    SPIRIT_TOKEN: IS_MAINNET ? "" : "",
    SPIRIT_TOKEN_FACTORY: IS_MAINNET ? "" : "",

    KNY_RELAYER_VERIFIER: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    KNY_BET: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    KAIJI_NO_YUREI: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
};

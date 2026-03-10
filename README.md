# Liminal Games – Smart Contract Suite

This repository contains the core Solidity contracts implemented for **Liminal Games**, a decentralized platform for skill-based psychological strategy games built on Ethereum Layer 2 (Base).

The contracts implement the on-chain systems powering the protocol, including staking mechanics, token infrastructure, liquidity integrations, and game logic components.

---

## 🎮 Project Overview

**Liminal Games** is designed around the principles of imperfect information, game theory, and trustless coordination. The protocol serves as a foundation for wagerable, turn-based multiplayer games where every move is a signal—and every hesitation, a tell.

Players engage in games of limited information and evolving incentives, powered entirely by deterministic, verifiable smart contracts.

The result is a minimal yet powerful framework that supports high-stakes strategic gameplay with complete transparency, no central authority, and provable fairness.

## 👨‍💻 Implementation Role

The smart contract suite in this repository was implemented as part of the **Liminal Games protocol infrastructure**.

Work included the development and implementation of core on-chain systems such as:

- Smart contract architecture for protocol components
- On-chain game resolution and treasury routing
- Trustless staking and vesting mechanisms
- ETH-native Uniswap V4 liquidity provisioning
- Dual-token infrastructure using $LIM and $SPIRIT
- Gas-efficient reward distribution systems

All contracts were written in Solidity and designed for deployment on the Base network.

---

## 🔗 permit2 Dependency Setup (Post-Install)

Uniswap v4-periphery imports from the `permit2` library using non-relative imports:

```solidity
import { IAllowanceTransfer } from "permit2/src/interfaces/IAllowanceTransfer.sol";
```

Since `permit2` is cloned into `lib/permit2` and not published on NPM, you must create a symbolic link so Hardhat can resolve it properly.

---

### ⚙️ How to Create the Symbolic Link (After `pnpm install`)

1. Open a terminal at the project root.
2. Run this command:

```powershell
New-Item -ItemType SymbolicLink -Path "node_modules\permit2" -Target ".\lib\permit2"
```

> ℹ️ On Windows, **Developer Mode must be enabled** to allow creating symlinks without admin rights.  
> Enable it here: `Settings → Update & Security → For Developers → Developer Mode`

---

### ❌ If the Link Already Exists or Fails

Delete and recreate it:

```powershell
Remove-Item -Force node_modules\permit2
New-Item -ItemType SymbolicLink -Path "node_modules\permit2" -Target ".\lib\permit2"
```

---

## 🔨 Contracts Included

| Contract | Description |
|---------|-------------|
| `LiminalToken.sol` | ERC20 governance token ($LIM) with minting restrictions and transfer logic. |
| `SpiritToken.sol` | Soft-pegged in-game ERC20 token ($SPIRIT) used for gameplay mechanics. |
| `SpiritTokenFactory.sol` | Handles ETH→SPIRIT minting and redemption at a fixed peg rate with fees. |
| `LIMGovernor.sol` | On-chain voting contract for $LIM governance proposals and execution. |
| `LiminalPresale.sol` | ETH-based presale contract with user allocation tracking and vesting tie-in. |
| `AirdropDistributor.sol` | Unlock-based token airdrop system supporting cliff and linear release. |
| `LiminalStakingPool.sol` | Native $LIM staking with proportional rewards. |
| `LPStakingRewards.sol` | Uniswap V4 LP position staking with time-weighted rewards and burn tracking. |
| `LongTermReserve.sol` | Protocol reserve vault with rate-limited token release. |
| `TeamVestingController.sol` | Role-based controller that manages team vesting wallets. |
| `TeamVestingWallet.sol` | Cliff + linear vesting wallet with revocation and recovery logic. |
| `TeamVestingVault.sol` | Vault that receives unvested assets and redistributes over time. |
| `GameTreasury.sol` | Manages treasury fees from games and controls liquidity fee routing. |
| `KaijiNoYurei.sol` | Main game contract with on-chain logic, encrypted number selection, and SPIRIT-based entry. |
| `KNYBet.sol`, `KNYBet2.sol` | Game variations and modular betting systems. |
| `KNYRelayerVerifier.sol` | Signature verifier for relayed user selections. |
| `V4PoolHelper.sol` | Initializes Uniswap V4 pools and manages core liquidity provisioning. |
| `V4SwapHelper.sol` | Executes swaps using Universal Router with Permit2 support and native ETH handling. |
| `V4Hook.sol`, `V4HookFactory.sol` | Custom Uniswap V4 hooks and logic extensions. |
| `Chainlink/MockChainlinkPriceFeed.sol` | Simulated Chainlink price feed for testing. |
| `Chainlink/LiminalDecryptNumbers.sol` | Chainlink-integrated decryption for game round validation. |

---

## 🧠 Key Features

- ✅ Uniswap V4 pool creation + minting with Permit2
- ✅ ETH-native liquidity bootstrapping
- ✅ Gas-optimized staking and airdrop distribution
- ✅ Role-based vesting with cliff + linear logic
- ✅ Game contract integration with fee redirection
- ✅ Full test coverage using Hardhat
- ✅ Modular and composable architecture

---

## 🌐 Deployments

### 🔵 Mainnet – [Base](https://basescan.org)
**Contracts Owner:** [`0xf6425D6023aE5C406F6CCC7b584e8f5Cc2D6ed11`](https://basescan.org/address/0xf6425D6023aE5C406F6CCC7b584e8f5Cc2D6ed11)

| Contract | Address |
|----------|---------|
| LiminalToken | [`0x7Aed7e8DB7b9284A8f99c52c592cC38215d9A13C`](https://basescan.org/address/0x7Aed7e8DB7b9284A8f99c52c592cC38215d9A13C) |
| V4HookFactory | [`0xdc5db2c2A069c32548877C4baA11894B7C7a83a3`](https://basescan.org/address/0xdc5db2c2A069c32548877C4baA11894B7C7a83a3) |
| V4Hook | [`0x937f1037FabE2287b1E4A7F533D43CC9014Bd540`](https://basescan.org/address/0x937f1037FabE2287b1E4A7F533D43CC9014Bd540) |
| V4PoolHelper | [`0x1cD7147E9Aa455641fcb4ed929fD96AdEd7685C6`](https://basescan.org/address/0x1cD7147E9Aa455641fcb4ed929fD96AdEd7685C6) |
| V4SwapHelper | [`0xa7180035039F38a38D4c6BFEbf5Ce0a052F80fB8`](https://basescan.org/address/0xa7180035039F38a38D4c6BFEbf5Ce0a052F80fB8) |
| LiminalPresale | [`0x53f080267Fdd2Afe00fc5AD12a5446aFD9eFf680`](https://basescan.org/address/0x53f080267Fdd2Afe00fc5AD12a5446aFD9eFf680) |
| LiminalDistributor | [`0x7BA420F73F8B11218FA7E3e4B569163D5f24B6C7`](https://basescan.org/address/0x7BA420F73F8B11218FA7E3e4B569163D5f24B6C7) |
| LongTermReserve | [`0xb978bcEC76BCb78ED2E2772EaBBd3585865a3307`](https://basescan.org/address/0xb978bcEC76BCb78ED2E2772EaBBd3585865a3307) |
| AirdropDistributor | [`0x98A486dcE870653389334B9349e40a1f7E470D3E`](https://basescan.org/address/0x98A486dcE870653389334B9349e40a1f7E470D3E) |
| TeamVestingController | [`0xd8668d13036d2107DEC5311D402Ce9B32be0B9d2`](https://basescan.org/address/0xd8668d13036d2107DEC5311D402Ce9B32be0B9d2) |
| TeamVestingVault | [`0xfA746dbb754627ffF37EEc202246deE14380D5CF`](https://basescan.org/address/0xfA746dbb754627ffF37EEc202246deE14380D5CF) |

**Uniswap V4 Events:**
- ✅ Pool Created: [`0x5168...a029`](https://basescan.org/tx/0x5168eae35515867fae6dd2f5d6d692ccf5020b46758301fd54bd9e6f7609a029)
- ✅ V4 Position Transferred (Token ID 76554): [`0x08ee...cd72`](https://basescan.org/tx/0x08ee82907786cb8c0fea90c30f106f12efb3806abc040dceda0e6d367295cd72)

---

### 🧪 Testnet – [Base Sepolia](https://sepolia.basescan.org)
**Contracts Owner:** [`0x179D189A7739d31Ba5a1839E3140958e20f1382e`](https://sepolia.basescan.org/address/0x179D189A7739d31Ba5a1839E3140958e20f1382e)

| Contract | Address |
|----------|---------|
| LiminalToken | [`0x24afD564E8ffd64227B172FE2EB72F61264e0c53`](https://sepolia.basescan.org/address/0x24afD564E8ffd64227B172FE2EB72F61264e0c53) |
| V4HookFactory | [`0x6DC42922f8B0f54f3d15E24Ab239f8b18FE4daAd`](https://sepolia.basescan.org/address/0x6DC42922f8B0f54f3d15E24Ab239f8b18FE4daAd) |
| V4Hook | [`0x1A6B26cFC6fd4BB3c77AE02B529b257fD0E9D540`](https://sepolia.basescan.org/address/0x1A6B26cFC6fd4BB3c77AE02B529b257fD0E9D540) |
| V4PoolHelper | [`0x6Bb28c572B2DF77ac4CD9663Ba237024f83E0b2C`](https://sepolia.basescan.org/address/0x6Bb28c572B2DF77ac4CD9663Ba237024f83E0b2C) |
| V4SwapHelper | [`0xA272da1f5A30ddC3F6EDFFAF3F9a1d0171110669`](https://sepolia.basescan.org/address/0xA272da1f5A30ddC3F6EDFFAF3F9a1d0171110669) |
| LiminalPresale | [`0xb839aE2e0217Aae116D1E7c4EF16B0AC050423f1`](https://sepolia.basescan.org/address/0xb839aE2e0217Aae116D1E7c4EF16B0AC050423f1) |
| LiminalDistributor | [`0x3004752Feba3a2Fa35058667db95283783E2b93B`](https://sepolia.basescan.org/address/0x3004752Feba3a2Fa35058667db95283783E2b93B) |
| LongTermReserve | [`0xf4Fc5EECb27e9513a5D67D675087946112CB867E`](https://sepolia.basescan.org/address/0xf4Fc5EECb27e9513a5D67D675087946112CB867E) |
| AirdropDistributor | [`0xf58F4D9d0e96b72806a4aB6c8D8149c21CF31Cf9`](https://sepolia.basescan.org/address/0xf58F4D9d0e96b72806a4aB6c8D8149c21CF31Cf9) |
| TeamVestingController | [`0x81c067D0E586ABd41Fc51F6AE416395E9Df4aE5A`](https://sepolia.basescan.org/address/0x81c067D0E586ABd41Fc51F6AE416395E9Df4aE5A) |
| TeamVestingVault | [`0x0E995e1c84dd800bC733962806f78Ed4B2249244`](https://sepolia.basescan.org/address/0x0E995e1c84dd800bC733962806f78Ed4B2249244) |

**Uniswap V4 Events:**
- ✅ Pool Created: [`0x0140...d493`](https://sepolia.basescan.org/tx/0x014002d7f9479a40fe5ad5c2a927348ecad355c495e646133abaf6e81736d493)
- ✅ V4 Position Transferred (Token ID 2033): [`0x30cb...a1a8`](https://sepolia.basescan.org/tx/0x30cbfa8594ed01947d9202c89c2f2a1be8b38c85802b27c056d78b3ac61da1a8)

---


## 🏗️ Built For

**Liminal Games**  
A crypto-native gaming platform.  
🌐 [liminal.games](https://www.liminalgames.net/)

---

## 🧑‍💻 Developed By

Smart contracts implemented by  
**Dantis Minurland Constantin**

Full-Stack Software Developer  
🌐 https://mdantis.dev  
✉️ hello@mdantis.dev

---

## 📄 License

This repository is licensed under the MIT License. See [`LICENSE`](./LICENSE) for details.

---

## ⭐ Usage

This repository is intended for **portfolio and showcase purposes**.  
If you are interested in similar smart contract development or blockchain integrations, feel free to get in touch.

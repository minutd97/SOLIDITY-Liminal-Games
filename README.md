# 🧰 Liminal Games – Developer Setup Guide

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

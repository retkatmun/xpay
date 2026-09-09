# XPay Smart Contracts

**XPay uses the official Circle USDC on Base Sepolia. No custom token.**

```
USDC on Base Sepolia: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
Chain ID: 84532
```

This directory contains one contract for **local Hardhat testing only**:

---

## TestUSDC

A minimal open-mint ERC-20 with 6 decimals. Identical decimals to real USDC, so the full XPay flow can be exercised on a local Hardhat node without a faucet or internet connection.

**This contract is never deployed by XPay in any environment where real USDC exists.**

When XPay runs against Base Sepolia testnet, `USDC_ADDRESS` points at Circle's official contract. `TestUSDC` is left behind entirely.

---

## Scripts

```bash
npm install

# Local Hardhat node
npx hardhat run scripts/deployMockUSDC.js --network hardhat

# Base Sepolia (requires RPC_URL + DEPLOYER_PK in .env)
# Only needed if you want TestUSDC for isolated testing — not needed for normal XPay operation
npx hardhat run scripts/deployMockUSDC.js --network base_sepolia
```

---

## Environment

```env
RPC_URL=https://sepolia.base.org
DEPLOYER_PK=0x...
```

See `.env.example` for details.

---

## See also

- [`BASE_SEPOLIA_SETUP.md`](../BASE_SEPOLIA_SETUP.md) — How to get real testnet USDC from Circle's faucet

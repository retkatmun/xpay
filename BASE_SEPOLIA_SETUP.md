# Base Sepolia Setup Guide

This guide walks you through setting up a treasury wallet on Base Sepolia and configuring XPay to use it.

---

## What is Base Sepolia?

Base Sepolia is the testnet for Base, Coinbase's Ethereum L2. XPay uses it in development to test blockchain payments without real money.

- **Chain ID:** 84532
- **RPC:** https://sepolia.base.org (public) or Alchemy/QuickNode (recommended for production)
- **Explorer:** https://sepolia.basescan.org
- **USDC contract:** `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (official Circle testnet USDC)

> Testnet USDC has **no financial value** and is not backed by real dollars.
> Circle explicitly states this. Do not confuse Base Sepolia USDC with mainnet USDC.

---

## Step 1: Create a Treasury Wallet

The treasury wallet is an EVM wallet that XPay uses to receive and send USDC on behalf of users.

### Option A: Using cast (Foundry)

```bash
# Install Foundry: https://getfoundry.sh
cast wallet new
```

Output:
```
Address:     0xYourTreasuryAddress
Private key: 0xYourPrivateKey
```

### Option B: Using MetaMask

1. Open MetaMask → Create a new account
2. Export the private key: Account Details → Export Private Key

> ⚠️ **Security:** In production, the private key must live in a KMS (AWS KMS, Google Cloud KMS, HashiCorp Vault). A `.env` file is acceptable only for testnet development.

---

## Step 2: Get Base Sepolia ETH (for gas)

You need a small amount of Base Sepolia ETH to pay gas fees.

1. Go to: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
2. Enter your treasury wallet address
3. Request testnet ETH

Alternatively:
- https://www.alchemy.com/faucets/base-sepolia
- Bridge from Ethereum Sepolia via https://superbridge.app

**Required:** ~0.01 ETH is enough for hundreds of transactions.

---

## Step 3: Get Base Sepolia USDC

1. Go to Circle's faucet: https://faucet.circle.com
2. Select **Base Sepolia**
3. Enter your treasury wallet address
4. Request USDC

You can also get testnet USDC by swapping on:
- https://app.uniswap.org (connect to Base Sepolia)

**Contract address to add to MetaMask:** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

---

## Step 4: Get an RPC URL

The public Base Sepolia RPC (`https://sepolia.base.org`) works for development.

For better reliability in production:
- **Alchemy:** https://www.alchemy.com → Create App → Base Sepolia
- **QuickNode:** https://www.quicknode.com → Base Sepolia endpoint
- **Infura:** https://infura.io → Base Sepolia

---

## Step 5: Configure backend/.env

Open (or create) `backend/.env` and fill in:

```env
BASE_RPC_URL="https://base-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY"
BASE_PRIVATE_KEY="0xYourTreasuryPrivateKey"
USDC_ADDRESS="0x036CbD53842c5426634e7929541eC2318f3dCF7e"
BASE_CHAIN_ID=84532
BASE_EXPLORER_URL="https://sepolia.basescan.org"
```

---

## Step 6: Verify the connection

Start the backend and check the health endpoint:

```bash
cd backend && npm run dev
```

In another terminal:
```bash
curl http://localhost:4000/health/providers
```

Expected output:
```json
{
  "ok": true,
  "checks": {
    "database": { "ok": true, "latencyMs": 3 },
    "chain": { "ok": true, "kind": "base_sepolia", "chainId": 84532 },
    "paystack": { "ok": true, "latencyMs": 210 }
  }
}
```

---

## Step 7: Test a USDC transfer

The dev fund endpoint (only available in development) loads USDC into an account. For real Base Sepolia:

1. Send USDC from your funded wallet to the treasury wallet address logged at startup
2. The treasury wallet balance is what XPay uses to pay out to users

To see the treasury address, start the backend — it logs at startup:
```
XPay API  →  http://localhost:4000
  Chain    : Base Sepolia (84532)
```

Check the treasury balance on BaseScan:
```
https://sepolia.basescan.org/address/0xYourTreasuryAddress
```

---

## Optional: Deploy TestUSDC for local Hardhat testing

If you want to run the full flow on a local Hardhat node (no network needed):

```bash
cd smart-contract
cp .env.example .env
# Edit .env: set DEPLOYER_PK to any Hardhat test account private key

npm install
npx hardhat run scripts/deployMockUSDC.js --network hardhat
```

This deploys `TestUSDC` — an open-mint ERC-20 with 6 decimals. It is **not** the real USDC contract. It exists only for local Hardhat tests.

---

## Architecture note

XPay uses a **custody model**:

```
User sends USDC
      ↓
Treasury wallet receives USDC
      ↓
Backend verifies on-chain
      ↓
Paystack initiates NGN bank transfer
      ↓
Recipient's bank account receives naira
```

The treasury wallet is a single EVM account that:
- Receives USDC from senders
- Holds USDC during settlement
- Signs USDC transfers to recipient wallets (XPay-to-XPay transfers)

In production, the private key for this wallet must be stored in a KMS — never in a `.env` file.

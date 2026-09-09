# XPay — Provider Setup Guide

This guide explains exactly how to obtain and configure every external credential XPay requires.

---

## Table of Contents

1. [PostgreSQL](#1-postgresql)
2. [Paystack](#2-paystack)
3. [Termii (SMS)](#3-termii-sms)
4. [Base Sepolia (Blockchain)](#4-base-sepolia-blockchain)
5. [FX Provider](#5-fx-provider)
6. [Quick Start Checklist](#6-quick-start-checklist)

---

## 1. PostgreSQL

XPay uses PostgreSQL 16 as its application database.

### Local development (Docker)

The repository includes a `docker-compose.yml` in `backend/`. Start the database with:

```bash
cd backend
docker compose up -d postgres
```

This starts PostgreSQL on **port 5433** (to avoid conflicting with any local Postgres on 5432).

Connection string:
```
DATABASE_URL="postgres://xpay:xpay@localhost:5433/xpay"
```

### Run migrations

After starting the database, apply the schema:

```bash
cd backend
npx tsx src/db/migrate.ts
```

You should see: `migrations applied`

Verify tables exist:
```bash
docker exec backend-postgres-1 psql -U xpay -d xpay -c "\dt"
```

Expected output includes: `users`, `wallet_accounts`, `bank_accounts`, `transactions`, `payouts`, `quotes`, `audit_logs`, `otp_codes`, `signup_tokens`, `web_sessions`, `mock_balances`

### Production

Use any hosted PostgreSQL service (Supabase, Neon, Railway, RDS, etc.).

Set:
```env
DATABASE_URL="postgres://user:password@host:5432/dbname?sslmode=require"
```

---

## 2. Paystack

Paystack is used for:
- Fetching the live list of supported Nigerian banks (`GET /api/banks`)
- Resolving bank account holder names (`POST /api/banks/resolve`)
- Creating transfer recipients (`POST /transferrecipient`)
- Initiating NGN bank transfers (`POST /transfer`)
- Receiving transfer status webhooks (`POST /api/webhooks/paystack`)

### Create a Paystack account

1. Go to [https://dashboard.paystack.com](https://dashboard.paystack.com)
2. Sign up and verify your email
3. For testing, you can use the test environment immediately — no business verification required

### Get your API key

1. In the Paystack Dashboard, go to **Settings → Developer**
2. Copy the **Test Secret Key** (starts with `sk_test_`)
3. For production, use the **Live Secret Key** (starts with `sk_live_`) — requires business verification

Set in `backend/.env`:
```env
PAYSTACK_SECRET_KEY="sk_test_YOUR_KEY_HERE"
```

### Enable transfers (required for payouts)

To send money to Nigerian bank accounts programmatically:

1. Go to **Settings → Preferences**
2. Under **Transfers**, enable **"Disable OTP for transfers"**
   (This is necessary for automated transfers. Paystack will still apply its own fraud checks.)

Without this step, every transfer attempt returns an OTP requirement error.

### Configure the webhook

For real payout status updates (transfer.success, transfer.failed, transfer.reversed):

1. Go to **Settings → Developer → Webhooks**
2. Set the webhook URL to:
   - Development: Use [ngrok](https://ngrok.com) to expose localhost — `https://YOUR_TUNNEL.ngrok.io/api/webhooks/paystack`
   - Production: `https://api.yourdomain.com/api/webhooks/paystack`
3. The webhook secret is your **same** `PAYSTACK_SECRET_KEY` — Paystack signs the payload with HMAC-SHA512

### Test bank account numbers (Paystack test environment)

Paystack provides test account numbers for the test environment:
- Any valid 10-digit number with a real bank code will resolve
- See: [Paystack Test Credentials](https://paystack.com/docs/payment/test-credentials/)

### Paystack test bank codes

| Bank | Code |
|------|------|
| GTBank | 058 |
| Access Bank | 044 |
| First Bank | 011 |
| UBA | 033 |
| Zenith Bank | 057 |
| OPay | 999992 |
| PalmPay | 999991 |
| Kuda Bank | 090267 |

---

## 3. Termii (SMS)

Termii sends real OTP SMS messages to Nigerian phone numbers, including DND-registered numbers.

### Create a Termii account

1. Go to [https://accounts.termii.com/#/](https://accounts.termii.com/#/)
2. Sign up with your email
3. Verify your account

### Get your API key

1. Log in to the Termii dashboard
2. Go to **Settings → API Key** (or **API Keys** in the sidebar)
3. Copy your API key

Set in `backend/.env`:
```env
TERMII_API_KEY="your-termii-api-key-here"
```

### Configure sender ID

The sender ID is the name or number shown to the recipient on their phone.

`N-Alert` is a generic sender ID pre-registered by Termii that can reach DND numbers in Nigeria.

For a custom sender ID (your brand name):
1. In the Termii dashboard, go to **Sender IDs**
2. Request a new sender ID
3. Wait for approval (usually 24-48 hours)
4. Set: `TERMII_SENDER_ID="YourBrand"`

### Channel

`dnd` is the recommended channel for Nigeria — it bypasses DND restrictions on Nigerian numbers.

```env
TERMII_CHANNEL="dnd"
```

### Development without Termii

If `TERMII_API_KEY` is not set and `NODE_ENV=development`:
- OTPs are returned in the API response as `devCode`
- No SMS is sent
- This is only for local testing — NEVER deploy without a real SMS provider

---

## 4. Base Sepolia (Blockchain)

XPay uses Base Sepolia testnet with the official Circle USDC contract for all on-chain transfers.

- **Chain ID**: 84532
- **USDC Contract**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **Block Explorer**: [https://sepolia.basescan.org](https://sepolia.basescan.org)

### Create the treasury wallet

The treasury wallet is an EVM wallet that signs all USDC transfers on behalf of XPay.

**Option A — using Node.js (no extra tools needed):**
```bash
node -e "
const crypto = require('crypto');
const key = '0x' + crypto.randomBytes(32).toString('hex');
console.log('PRIVATE KEY (add to .env as BASE_PRIVATE_KEY):', key);
// To get the address, install viem: npm install viem
// const {privateKeyToAccount} = require('viem/accounts');
// console.log('ADDRESS:', privateKeyToAccount(key).address);
"
```

**Option B — using Foundry cast:**
```bash
cast wallet new
```
This prints both the private key and address.

**Option C — using MetaMask:**
- Create a new account (do NOT reuse a personal account)
- Export the private key from MetaMask: Settings → Account Details → Export private key

Set in `backend/.env`:
```env
BASE_PRIVATE_KEY="0xYOUR_PRIVATE_KEY_HERE"
```

> **NEVER commit this key. NEVER share it. NEVER log it. In production, use a KMS.**

### Fund the treasury wallet with testnet ETH

Base Sepolia ETH is needed to pay gas fees.

1. Copy the treasury wallet address (from the step above)
2. Go to: [https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
3. Paste your address and request test ETH

Alternative faucets:
- [https://docs.base.org/docs/tools/network-faucets/](https://docs.base.org/docs/tools/network-faucets/)

### Fund the treasury wallet with testnet USDC

Base Sepolia USDC is the token used for all transfers.

1. Go to: [https://faucet.circle.com](https://faucet.circle.com)
2. Select **Base Sepolia** and **USDC**
3. Enter your treasury wallet address
4. Request test USDC

### Configure the RPC URL

**Free public endpoint (no key required):**
```env
BASE_RPC_URL="https://sepolia.base.org"
```

**Alchemy (more reliable for production — free tier available):**
1. Go to [https://alchemy.com](https://alchemy.com)
2. Create an app → Select **Base Sepolia**
3. Copy the API key
4. Set: `BASE_RPC_URL="https://base-sepolia.g.alchemy.com/v2/YOUR_KEY"`

**QuickNode:**
1. Go to [https://www.quicknode.com](https://www.quicknode.com)
2. Create an endpoint → Select **Base Sepolia**
3. Copy the HTTP URL

### Verify the wallet is funded

After setup, check the health endpoint:
```bash
curl http://localhost:4000/health/providers
```

The `chain` check should return `ok`.

### Production note

For production (Base Mainnet), you need:
- `BASE_CHAIN_ID=8453` (Base Mainnet)
- Real ETH for gas
- Real USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` on Base Mainnet)
- A KMS-managed private key (not a `.env` file)
- Regulatory compliance for handling real money

---

## 5. FX Provider

XPay uses a foreign exchange rate provider to quote USD/NGN conversion rates.

### exchangerate-api (default — no key required)

The free open endpoint works without an API key:

```env
FX_PROVIDER="exchangerate-api"
FX_API_KEY=""
```

The free open endpoint is rate-limited. For higher volume, sign up for a free API key:
1. Go to [https://www.exchangerate-api.com](https://www.exchangerate-api.com)
2. Sign up for the free plan (1,500 requests/month)
3. Set: `FX_API_KEY="your-key-here"`

### openexchangerates

1. Go to [https://openexchangerates.org/signup/free](https://openexchangerates.org/signup/free)
2. Sign up (free plan: 1,000 requests/month)
3. Get your App ID
4. Set:
```env
FX_PROVIDER="openexchangerates"
FX_API_KEY="your-app-id-here"
```

### fixer

Fixer is paid-only (no free tier):
1. Go to [https://fixer.io](https://fixer.io)
2. Sign up for a plan
3. Set:
```env
FX_PROVIDER="fixer"
FX_API_KEY="your-api-key-here"
```

---

## 6. Quick Start Checklist

After cloning the repository, complete these steps in order:

```
[ ] 1. cd backend && cp .env.example .env
[ ] 2. Generate SESSION_SECRET and add to .env
[ ] 3. Start PostgreSQL: docker compose up -d postgres
[ ] 4. Run migration: npx tsx src/db/migrate.ts
[ ] 5. Add PAYSTACK_SECRET_KEY to .env (from Paystack dashboard)
[ ] 6. Add BASE_PRIVATE_KEY to .env (new EVM wallet)
[ ] 7. Fund treasury wallet with Base Sepolia ETH (Coinbase faucet)
[ ] 8. Fund treasury wallet with Base Sepolia USDC (Circle faucet)
[ ] 9. (Optional) Add TERMII_API_KEY for real SMS; otherwise devCode is returned in dev
[ ] 10. cd ../frontend && cp .env.example .env.local
[ ] 11. Start backend: cd backend && npm run dev
[ ] 12. Start frontend: cd frontend && npm run dev
[ ] 13. Verify: curl http://localhost:4000/health
[ ] 14. Verify: curl http://localhost:4000/health/providers
[ ] 15. Open http://localhost:3000 and test registration
```

### Required for basic functionality

| Variable | Where | Required for |
|----------|-------|-------------|
| `DATABASE_URL` | backend/.env | Everything |
| `SESSION_SECRET` | backend/.env | Auth cookies |
| `PAYSTACK_SECRET_KEY` | backend/.env | Bank list, account resolution, NGN payouts |
| `BASE_PRIVATE_KEY` | backend/.env | Blockchain transfers |
| `BASE_RPC_URL` | backend/.env | Blockchain connection |

### Optional but recommended

| Variable | Where | Purpose |
|----------|-------|---------|
| `TERMII_API_KEY` | backend/.env | Real SMS OTP delivery |
| `FX_API_KEY` | backend/.env | Higher FX rate limits |

---

## Security Reminders

- **NEVER** commit `.env` files to version control
- **NEVER** log `BASE_PRIVATE_KEY`, `PAYSTACK_SECRET_KEY`, or `SESSION_SECRET`
- **NEVER** expose Paystack's secret key in frontend code
- In production, use environment secrets (Vercel secrets, AWS Secrets Manager, etc.) not `.env` files
- The treasury wallet private key in production should be in a KMS, not a file

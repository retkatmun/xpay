# XPay — Architecture

XPay is a cross-border remittance app: users send USDC on Base Sepolia, and recipients receive NGN through Paystack bank transfer.

---

## High-level flow

```
User (web)
    │
    ▼
Next.js Frontend  ──────── REST ──────────  Express Backend
                                                │
                                    ┌───────────┼───────────┐
                                    ▼           ▼           ▼
                              PostgreSQL   Paystack     Base Sepolia
                              (state)      (NGN payout) (USDC chain)
                                                │
                                    Termii SMS (OTP delivery)
```

---

## Directory layout

```
backend/
├── src/
│   ├── config.ts              validated env vars — process.exit(1) if invalid
│   ├── index.ts               Express server, /health, /health/providers
│   ├── chain/
│   │   ├── adapter.ts         ChainAdapter interface
│   │   ├── baseSepolia.ts     viem — Base Sepolia USDC transfers
│   │   ├── index.ts           returns BaseSepoliaChain (or MockChain in tests)
│   │   └── mock.ts            mock chain for tests only
│   ├── db/
│   │   ├── schema.ts          Drizzle ORM schema
│   │   ├── index.ts           pg pool + drizzle instance
│   │   ├── migrate.ts         migration runner
│   │   └── migrations/        SQL migration files
│   ├── http/
│   │   └── api/
│   │       └── index.ts       All REST routes
│   ├── lib/
│   │   ├── errors.ts          Result<T> type, DomainError
│   │   ├── identity.ts        phone normalisation, handle validation
│   │   ├── ids.ts             newId(), newToken(), newOtp()
│   │   └── money.ts           parseBaseUnits, parseAmount
│   ├── providers/
│   │   ├── bank/
│   │   │   ├── BankProvider.ts          interface + NIGERIAN_BANKS static list
│   │   │   ├── PaystackBankProvider.ts  live Paystack bank list + account resolution
│   │   │   ├── MockBankProvider.ts      test-only mock
│   │   │   └── index.ts                 returns Paystack in production, Mock in tests
│   │   ├── fx/
│   │   │   ├── FXProvider.ts            interface
│   │   │   ├── RealFXProvider.ts        exchangerate-api / openexchangerates / fixer
│   │   │   ├── MockFXProvider.ts        test-only mock
│   │   │   └── index.ts                 returns Real in production, Mock in tests
│   │   ├── payout/
│   │   │   ├── PayoutProvider.ts        interface
│   │   │   ├── PaystackPayoutProvider.ts  NGN transfer via Paystack Transfers API
│   │   │   ├── MockPayoutProvider.ts    test-only mock
│   │   │   └── index.ts                 returns Paystack in production, Mock in tests
│   │   └── sms/
│   │       ├── SmsProvider.ts           interface
│   │       ├── TermiiSmsProvider.ts     real SMS via Termii
│   │       └── index.ts                 returns Termii if TERMII_API_KEY set, else null
│   ├── services/
│   │   ├── accounts.ts        user creation, handle/phone lookup
│   │   ├── auth.ts            OTP, sessions, PIN verify/change
│   │   ├── audit.ts           append-only audit log
│   │   ├── bankAccounts.ts    linked bank accounts
│   │   ├── payouts.ts         payout queries
│   │   ├── quotes.ts          FX quote creation + consumption
│   │   └── transactions.ts    full send flow + state machine
│   └── types/                 shared TypeScript types
frontend/
├── app/                       Next.js App Router pages
│   ├── page.tsx               Landing page (phone mockup + CTA)
│   ├── phone/                 Enter phone number
│   ├── verify/                Enter OTP
│   ├── username/              Choose handle + name
│   ├── pin/                   Create 4-digit PIN
│   ├── login/                 Login (phone + PIN)
│   ├── home/                  Dashboard: balance + recent transactions
│   ├── send/                  Send USDC → NGN (bank or XPay user)
│   ├── receive/               Show wallet address / handle to receive
│   └── activity/
│       ├── page.tsx           Transaction history
│       └── [id]/page.tsx      Transaction detail with timeline
├── components/                Reusable UI components
├── lib/
│   ├── api/index.ts           API client (all backend calls)
│   ├── types.ts               Wire types (mirrors backend DTOs)
│   ├── money.ts               formatUSD, parseAmount
│   ├── time.ts                relativeTime, dayLabel, fullTime
│   ├── txStatus.ts            statusLabel, statusColor, isTerminal
│   ├── session.tsx            useSession hook
│   └── onboarding.ts          onboarding state helpers
smart-contract/
├── contracts/MockUSDT.sol     Legacy Quai test contract (not used in production)
├── test/                      Hardhat tests for MockUSDT
└── scripts/                   Legacy Quai deployment scripts (not used)
```

---

## Database schema

| Table | Purpose |
|-------|---------|
| `users` | Account: phone, username, PIN hash, lock state |
| `wallet_accounts` | Custodial EVM wallet per user per chain |
| `bank_accounts` | Linked Nigerian bank accounts (encrypted account number) |
| `transactions` | Core transaction record + state machine |
| `payouts` | NGN bank payout per transaction |
| `quotes` | FX quotes (TTL-limited, single-use) |
| `audit_logs` | Immutable append-only audit trail |
| `otp_codes` | Hashed OTP + expiry + attempt counter |
| `signup_tokens` | Single-use proof-of-phone for account creation |
| `web_sessions` | Session tokens (hashed) |
| `mock_balances` | Mock chain balances for tests only |

---

## Transaction state machine

```
created
   │
   ▼
awaiting_payment          ← sender must send USDC on-chain
   │
   ▼
blockchain_detected       ← txHash found on chain
   │
   ▼
blockchain_confirmed      ← N confirmations reached (default: 2)
   │
   ▼
payout_pending            ← Paystack recipient created
   │
   ▼
payout_processing         ← Paystack transfer initiated
   │
   ▼
completed                 ← Paystack webhook: transfer.success

Failure states:
  blockchain_failed       ← on-chain revert or timeout
  payout_failed           ← Paystack transfer failed / reversed
  expired                 ← quote expired before payment
  cancelled               ← user or admin cancelled
  manual_review           ← flagged for manual intervention
```

---

## Provider selection

All providers default to real (production) implementations.
Mocks are loaded only when `NODE_ENV=test`.

| Provider | Production | Test |
|----------|-----------|------|
| Bank | PaystackBankProvider | MockBankProvider |
| Payout | PaystackPayoutProvider | MockPayoutProvider |
| FX | RealFXProvider | MockFXProvider |
| Chain | BaseSepoliaChain | MockChain |
| SMS | TermiiSmsProvider (if key set) | null → devCode |

---

## API routes

```
POST /api/auth/otp/request      request OTP (rate limited)
POST /api/auth/otp/verify       verify OTP → signup token
POST /api/auth/otp/resend       resend OTP (cooldown enforced)
GET  /api/auth/username/check   check handle availability
POST /api/auth/signup           create account
POST /api/auth/login            login with phone + PIN
POST /api/auth/signout          destroy session
POST /api/auth/pin              change PIN
POST /api/auth/pin/verify       verify PIN without transacting

GET  /api/me                    current session user
GET  /api/balance               on-chain USDC balance

GET  /api/resolve               resolve handle or phone → user
GET  /api/users/username/:u     look up user by handle
GET  /api/users/phone/:p        look up user by phone
GET  /api/recipients/recent     recently transacted-with users

GET  /api/banks                 live Paystack bank list (cached)
POST /api/banks/resolve         resolve bank account → holder name

POST /api/quotes                create FX quote

POST /api/transactions          initiate send (user or bank)
GET  /api/transactions          transaction history
GET  /api/transactions/:id      transaction detail + payout

GET  /api/payouts               payout history
GET  /api/payouts/:id           payout detail

GET  /api/bank-accounts         linked bank accounts
POST /api/bank-accounts         link a new bank account

POST /api/webhooks/paystack     Paystack transfer status webhook

POST /api/dev/fund              (development only) fund test wallet

GET  /health                    liveness + chain info
GET  /health/providers          readiness: db, chain, paystack
```

---

## Security model

- **OTPs**: 6-digit cryptographically random, argon2id hashed at rest, single-use, 5-attempt lockout
- **Sessions**: 32-byte random token, stored as SHA-256(token + SESSION_SECRET), httpOnly cookie
- **Signup tokens**: single-use proof that a phone was OTP-verified before account creation
- **PIN**: 4-digit, argon2id hashed, 5-attempt lockout with 15-minute timeout
- **Paystack key**: server-side only — never in frontend code
- **BASE_PRIVATE_KEY**: server-side only — never logged, never in response
- **Webhook**: HMAC-SHA512 signature verified before any processing
- **Idempotency**: unique DB constraints prevent double-submission

---

## External credentials required

| Variable | Where to get it |
|----------|----------------|
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `PAYSTACK_SECRET_KEY` | dashboard.paystack.com → Settings → Developer |
| `BASE_PRIVATE_KEY` | New EVM wallet (never reuse a personal wallet) |
| `BASE_RPC_URL` | https://sepolia.base.org (free public) or Alchemy/QuickNode |
| `TERMII_API_KEY` | accounts.termii.com → Settings → API Key |

See `docs/PROVIDER_SETUP.md` for detailed instructions.

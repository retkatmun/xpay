# XPay Backend

**Send dollars. Receive naira. No P2P.**

Node.js + TypeScript + Express + PostgreSQL + Drizzle ORM + Paystack + Base Sepolia (USDC).

---

## Quick start

```bash
cp .env.example .env
# Fill in: DATABASE_URL, SESSION_SECRET, PAYSTACK_SECRET_KEY,
#          BASE_RPC_URL, BASE_PRIVATE_KEY, FX_API_KEY

npm install
npm run db:up         # Start Postgres via Docker
npm run db:migrate    # Run migrations
npm run dev           # Start dev server at http://localhost:4000
```

---

## Architecture

```
Frontend
  ↓ HTTP (cookie session)
Express API
  ↓
Services (auth, transactions, quotes, payouts)
  ↓
Providers (chain, bank, fx, payout)
  ↓
Postgres (Drizzle ORM)   Base Sepolia (viem)   Paystack API
```

### Key principles

- **No fakes in production.** Mock providers (`MockBankProvider`, `MockFXProvider`, `MockPayoutProvider`, `MockChain`) are only loaded when `NODE_ENV=test`.
- **Fail loudly.** Missing environment variables cause an immediate startup error. The service never starts misconfigured.
- **Money is bigint.** All USDC amounts are in base units (6 decimals). `$1.00 = 1_000_000n`. No floats.
- **Idempotency.** Every money movement is protected by a unique idempotency key. Retrying a request that already succeeded returns the original result.
- **PIN is Argon2id.** Never stored in plaintext. Never logged. Never sent to the frontend.

---

## Scripts

```bash
npm run dev           # Development server (tsx watch)
npm run build         # Compile TypeScript → dist/
npm run start         # Run compiled build
npm run test          # Unit tests (vitest)
npm run typecheck     # tsc --noEmit
npm run db:up         # docker compose up -d (Postgres)
npm run db:down       # docker compose down
npm run db:generate   # drizzle-kit generate (after schema changes)
npm run db:migrate    # Run pending migrations
npm run db:studio     # Drizzle Studio GUI
```

---

## Environment variables

See `.env.example` for the full list with documentation.

Required at startup:
- `DATABASE_URL`
- `SESSION_SECRET` (min 32 chars)
- `PAYSTACK_SECRET_KEY`
- `BASE_RPC_URL`
- `BASE_PRIVATE_KEY`
- `FX_API_KEY`

---

## Provider abstractions

| Interface | Production | Test |
|-----------|-----------|------|
| `ChainAdapter` | `BaseSepoliaChain` (viem) | `MockChain` |
| `BankProvider` | `PaystackBankProvider` | `MockBankProvider` |
| `FXProvider` | `RealFXProvider` | `MockFXProvider` |
| `PayoutProvider` | `PaystackPayoutProvider` | `MockPayoutProvider` |

---

## Testing

Unit tests cover pure business logic — identity rules, money arithmetic, state machine, mock providers. No database or network needed.

```bash
npm run test
```

For integration tests (requires Postgres and real credentials), see `test/api.e2e.mjs`.

---

## See also

- [`docs/API.md`](../docs/API.md) — REST API documentation
- [`BASE_SEPOLIA_SETUP.md`](../BASE_SEPOLIA_SETUP.md) — Base Sepolia wallet and USDC setup

# XPay — Web App

**Send dollars. Receive naira. No P2P.**

Next.js 16 + TypeScript + Tailwind CSS.

The frontend is a thin API client. No business logic, no local state, no mock data.
All operations go through the XPay backend API.

---

## Quick start

```bash
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:4000

npm install
npm run dev   # http://localhost:3000
```

Make sure the backend is running first. See `backend/README.md`.

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/phone` | Enter phone number (step 1 of signup) |
| `/verify` | Enter OTP code (step 2) |
| `/pin` | Set 4-digit PIN (step 3) |
| `/username` | Pick handle + display name (step 4) |
| `/home` | Dashboard — balance + recent transactions |
| `/send` | Send money (XPay user or Nigerian bank account) |
| `/receive` | Show your handle/address for receiving |
| `/activity` | Full transaction history |
| `/activity/[id]` | Transaction detail |

---

## Architecture

```
/app           Next.js App Router pages
/components    Reusable UI primitives
/lib/api       HTTP client (calls backend API — no localStorage, no mocks)
/lib/types     Shared TypeScript types (mirrors backend response shapes)
/lib/money     USDC/NGN formatting (bigint-safe)
/lib/session   Auth context (server-side session via cookie)
/lib/onboarding Signup draft state (sessionStorage — cleared on completion)
```

---

## Environment variables

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

In production, set this to your backend's HTTPS URL.

---

## Send flow

```
Choose recipient type
  ↓
XPay user lookup (username / phone)
  OR
Bank select → account number → Paystack verification → confirm account name
  ↓
Enter USDC amount
  ↓
Review quote (live rate, fee, NGN payout)
  ↓
4-digit PIN
  ↓
Backend: blockchain transfer + Paystack payout
  ↓
Transaction receipt
```

The frontend never touches private keys or calculates FX rates.
All transaction validation happens on the backend.

---

## Scripts

```bash
npm run dev     # Development server
npm run build   # Production build
npm run start   # Serve production build
npm run lint    # ESLint
```

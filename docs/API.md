# XPay API Documentation

Base URL: `http://localhost:4000` (development) or `https://api.yourxpaydomain.com` (production)

All authenticated endpoints require an active session cookie (`xpay_session`), set via `POST /api/auth/login` or `POST /api/auth/signup`.

All amounts are in USDC base units (6 decimals) unless noted. `$1.00 = 1000000`.

---

## Authentication

### POST /api/auth/otp/request

Request an OTP for a phone number. In development the OTP is returned in the response body (`devCode`).

**Body:**
```json
{ "phone": "+2348031234567" }
```

**Response:**
```json
{ "sent": true }
```
In development: `{ "sent": true, "devCode": "123456" }`

---

### POST /api/auth/otp/verify

Verify an OTP and receive a `signupToken` for creating an account.

**Body:**
```json
{ "phone": "+2348031234567", "code": "123456" }
```

**Response (success):**
```json
{ "ok": true, "value": { "signupToken": "eyJ..." } }
```

---

### POST /api/auth/signup

Create a new XPay account. Requires a valid `signupToken` from OTP verification.

**Body:**
```json
{
  "signupToken": "eyJ...",
  "username": "scholar",
  "displayName": "Scholar Gamaliel",
  "pin": "1234"
}
```

**Response:**
```json
{
  "user": {
    "id": "u_01abc",
    "phone": "+2348031234567",
    "username": "scholar",
    "displayName": "Scholar Gamaliel"
  }
}
```

Sets `xpay_session` cookie.

---

### POST /api/auth/login

Log in with phone and PIN.

**Body:**
```json
{ "phone": "+2348031234567", "pin": "1234" }
```

**Response:**
```json
{ "user": { ... } }
```

Sets `xpay_session` cookie.

---

### POST /api/auth/signout

Destroy the current session.

**Response:** `204 No Content`

---

### GET /api/me

Get the currently authenticated user.

**Response:** User object or `null` if not authenticated.

---

### POST /api/auth/pin/verify

Verify a PIN without performing a transaction. Used to pre-check before showing confirmation UI.

**Body:** `{ "pin": "1234" }`

**Response:** `{ "ok": true }` or `{ "ok": false, "reason": "wrong_pin" | "locked" }`

---

## Balance

### GET /api/balance

Get the authenticated user's USDC balance.

**Response:**
```json
{
  "usd": "40000000",
  "asset": "USDC",
  "chainId": 84532
}
```

---

## Banks

### GET /api/banks

List all supported Nigerian banks from Paystack.

**Response:**
```json
[
  { "code": "044", "name": "Access Bank" },
  { "code": "058", "name": "GTBank" },
  ...
]
```

---

### POST /api/banks/resolve

Resolve a Nigerian bank account number to the account holder's name. Calls the real Paystack API.

**Requires:** Authentication

**Body:**
```json
{ "bankCode": "044", "accountNumber": "0123456789" }
```

**Response (success):**
```json
{
  "success": true,
  "bankCode": "044",
  "bankName": "Access Bank",
  "accountNumber": "0123456789",
  "accountName": "SCHOLAR GAMALIEL"
}
```

**Response (failure):**
```json
{ "success": false, "reason": "invalid_account" | "bank_not_found" | "provider_error" }
```

---

## Quotes

### POST /api/quotes

Generate a time-limited FX quote for a USDC → NGN conversion.

**Requires:** Authentication

**Body:**
```json
{ "amount": "100000000" }
```
(100 USDC in base units)

**Response:**
```json
{
  "ok": true,
  "quote": {
    "id": "q_01abc",
    "asset": "USDC",
    "amount": "100000000",
    "fxRate": 1583,
    "feeNgn": "0",
    "ngnAmountGross": "158300",
    "ngnAmount": "158300",
    "expiresAt": "2024-01-01T12:05:00Z"
  }
}
```

Quotes are valid for `QUOTE_TTL_SECONDS` (default 300s = 5 minutes) and single-use.

---

## Transactions

### POST /api/transactions

Create and execute a transaction. Verifies PIN, validates quote, executes blockchain transfer.

**Requires:** Authentication

**Body (XPay user):**
```json
{
  "recipientType": "xpay_user",
  "recipient": "scholar.xpay",
  "quoteId": "q_01abc",
  "pin": "1234",
  "memo": "For rent",
  "idempotencyKey": "unique-client-key"
}
```

**Body (bank account):**
```json
{
  "recipientType": "bank_account",
  "bankCode": "044",
  "accountNumber": "0123456789",
  "accountName": "SCHOLAR GAMALIEL",
  "quoteId": "q_01abc",
  "pin": "1234",
  "memo": "August rent",
  "idempotencyKey": "unique-client-key"
}
```

**Response:**
```json
{
  "ok": true,
  "transaction": {
    "id": "tx_01abc",
    "direction": "out",
    "recipientType": "bank_account",
    "recipientDisplayName": "SCHOLAR GAMALIEL",
    "recipientBankName": "Access Bank",
    "recipientAccountNumberLast4": "6789",
    "asset": "USDC",
    "amount": "100000000",
    "chainId": 84532,
    "txHash": "0xabc...",
    "status": "payout_processing",
    "feeNgn": "0",
    "fxRate": 1583,
    "ngnAmount": "158300",
    "memo": "August rent",
    "createdAt": "2024-01-01T12:00:00Z",
    "updatedAt": "2024-01-01T12:00:05Z"
  },
  "confirmed": false
}
```

**Error reasons:** `wrong_pin` | `locked` | `insufficient` | `quote_expired` | `invalid` | `chain_error`

---

### GET /api/transactions

List all transactions for the authenticated user (newest first).

**Response:** Array of transaction objects.

---

### GET /api/transactions/:id

Get a single transaction with its payout details.

**Response:**
```json
{
  ...transaction,
  "payout": {
    "id": "po_01abc",
    "transactionId": "tx_01abc",
    "provider": "paystack",
    "amountNgn": "158300",
    "bankName": "Access Bank",
    "bankAccountNumber": "0123456789",
    "accountName": "SCHOLAR GAMALIEL",
    "status": "processing",
    "providerReference": "po_01abc",
    "createdAt": "2024-01-01T12:00:05Z"
  }
}
```

---

## Payouts

### GET /api/payouts

List all payouts for the authenticated user.

### GET /api/payouts/:id

Get a single payout by ID.

---

## Bank Accounts (Saved)

### GET /api/bank-accounts

List saved bank accounts for the authenticated user.

### POST /api/bank-accounts

Link a new bank account. Calls Paystack to verify the account name.

**Body:**
```json
{
  "bankCode": "044",
  "accountNumber": "0123456789",
  "setAsDefault": true
}
```

---

## Webhooks

### POST /api/webhooks/paystack

Receives Paystack transfer status updates. Signature is verified using HMAC-SHA512.

This endpoint must be configured in the Paystack Dashboard:
1. Go to **Settings → API Keys & Webhooks**
2. Set the webhook URL to `https://yourapi.com/api/webhooks/paystack`
3. Paystack will send `transfer.success`, `transfer.failed`, `transfer.reversed` events

**Headers required:** `x-paystack-signature: <hmac-sha512-of-body>`

**Response:** `200 OK` — always, even if the signature is invalid (to prevent enumeration).

Signature failures return `400` or `401` before processing.

---

## Health

### GET /health

Basic liveness check.

**Response:**
```json
{
  "ok": true,
  "product": "XPay",
  "chain": "base_sepolia",
  "chainId": 84532,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### GET /health/providers

Full readiness check — verifies database, chain adapter, and Paystack connectivity.

**Response (all healthy):**
```json
{
  "ok": true,
  "checks": {
    "database": { "ok": true, "latencyMs": 3 },
    "chain": { "ok": true, "latencyMs": 45, "kind": "base_sepolia", "chainId": 84532 },
    "paystack": { "ok": true, "latencyMs": 210 }
  }
}
```

HTTP 503 if any provider is unhealthy.

---

## Error format

All errors return JSON:

```json
{ "error": "reason_string" }
```

Common reasons: `unauthorized`, `not_found`, `invalid`, `wrong_pin`, `locked`, `insufficient`, `quote_expired`, `chain_error`, `too_many_requests`

---

## Transaction status flow

```
created
  → awaiting_payment        (transaction record created, waiting for blockchain payment)
  → blockchain_detected     (USDC transaction seen on-chain)
  → blockchain_confirmed    (required confirmations reached)
  → payout_pending          (waiting to initiate NGN transfer)
  → payout_processing       (Paystack transfer initiated)
  → completed               (Paystack confirms success via webhook)

Failure states (terminal):
  blockchain_failed         (on-chain payment failed or reverted)
  payout_failed             (Paystack transfer failed)
  cancelled                 (user or system cancelled)
  expired                   (quote or payment window expired)
  manual_review             (requires manual investigation)
```

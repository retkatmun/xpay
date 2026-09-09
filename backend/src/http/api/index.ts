import { Router, type Request, type Response } from "express"
import express from "express"
import { z } from "zod"
import { eq, inArray } from "drizzle-orm"
import { config, isProduction } from "../../config.js"
import { db } from "../../db/index.js"
import { users, walletAccounts, type UserRow } from "../../db/schema.js"
import { parseBaseUnits, parseAmount } from "../../lib/money.js"
import { normalizePhone } from "../../lib/identity.js"
import * as accounts from "../../services/accounts.js"
import * as auth from "../../services/auth.js"
import * as transactionsService from "../../services/transactions.js"
import * as payoutsService from "../../services/payouts.js"
import * as bankAccountsService from "../../services/bankAccounts.js"
import * as quotesService from "../../services/quotes.js"
import { bankProvider } from "../../providers/bank/index.js"
import { audit } from "../../services/audit.js"

/**
 * XPay REST API.
 *
 * All business rules live in services/. This layer only:
 * 1. Parses and validates the request
 * 2. Calls the appropriate service
 * 3. Formats the response
 *
 * Error reasons match the strings the frontend switches on — keep them in sync.
 */

export const SESSION_COOKIE = "xpay_session"

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProduction,
  path: "/",
  maxAge: config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
}

export const api = Router()

/** Attach the signed-in user to the request, or respond 401. */
async function requireUser(req: Request, res: Response): Promise<UserRow | null> {
  const user = await auth.sessionUser(req.cookies?.[SESSION_COOKIE])
  if (!user) {
    res.status(401).json({ error: "unauthorized" })
    return null
  }
  return user
}

// ─────────────────────────────────────────── onboarding

api.post("/auth/otp/request", async (req, res) => {
  const body = z.object({ phone: z.string() }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: "invalid" })

  const phone = normalizePhone(body.data.phone)
  if (!phone) return res.status(400).json({ error: "invalid" })

  const result = await auth.requestOtp(phone)

  // SMS provider not configured and DEV_SHOW_OTP is not enabled.
  if (result.smsError && !result.code) {
    console.error("[otp/request] SMS error:", result.smsError)
    return res.status(503).json({
      error: "sms_unavailable",
      message: isProduction
        ? "SMS delivery is currently unavailable. Please try again later."
        : `SMS configuration error: ${result.smsError}`,
    })
  }

  // DEV_SHOW_OTP=true in non-production — expose the code for debugging.
  // In production, DEV_SHOW_OTP is blocked at startup, so this branch is unreachable there.
  return res.json(
    result.code
      ? { sent: true, devCode: result.code }
      : { sent: true },
  )
})

api.post("/auth/otp/verify", async (req, res) => {
  const body = z.object({ phone: z.string(), code: z.string() }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ ok: false })

  const phone = normalizePhone(body.data.phone)
  if (!phone) return res.json({ ok: false })

  const result = await auth.verifyOtp(phone, body.data.code)
  if (!result.ok) return res.json({ ok: false, reason: result.reason })

  return res.json({ ok: true, signupToken: result.value.signupToken })
})

api.get("/auth/username/check", async (req, res) => {
  const username = String(req.query.username ?? "")
  return res.json(await accounts.checkUsername(username))
})

api.post("/auth/signup", async (req, res) => {
  const body = z
    .object({
      signupToken: z.string(),
      username: z.string(),
      displayName: z.string().min(2).max(60),
      pin: z.string(),
    })
    .safeParse(req.body)

  if (!body.success) return res.status(400).json({ error: "invalid" })

  // The phone comes from the token, not from the request — a client cannot claim
  // a number it hasn't proven.
  const phone = await auth.consumeSignupToken(body.data.signupToken)
  if (!phone) return res.status(401).json({ error: "unauthorized" })

  const created = await accounts.createAccount({
    phone,
    username: body.data.username,
    displayName: body.data.displayName,
    pin: body.data.pin,
  })

  if (!created.ok) return res.status(400).json({ error: created.reason })

  await audit(created.value.id, "user.signup", "user", created.value.id, {
    username: created.value.username,
  }, req.ip)

  const token = await auth.createSession(created.value.id)
  res.cookie(SESSION_COOKIE, token, cookieOptions)

  return res.status(201).json({ user: await toUserDto(created.value) })
})

api.post("/auth/login", async (req, res) => {
  const body = z.object({ phone: z.string(), pin: z.string() }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: "invalid" })

  const phone = normalizePhone(body.data.phone)
  if (!phone) return res.status(400).json({ error: "invalid" })

  const user = await accounts.findByPhone(phone)
  // Same response whether the number is unknown or the PIN is wrong —
  // the endpoint cannot be used to enumerate who has an account.
  if (!user) return res.status(401).json({ error: "wrong_pin" })

  const check = await auth.verifyPin(user, body.data.pin)
  if (!check.ok) {
    await audit(user.id, "login.failed", "user", user.id, { reason: check.reason }, req.ip)
    return res.status(401).json({ error: check.reason })
  }

  await audit(user.id, "login.success", "user", user.id, {}, req.ip)

  const token = await auth.createSession(user.id)
  res.cookie(SESSION_COOKIE, token, cookieOptions)

  return res.json({ user: await toUserDto(user) })
})

api.post("/auth/signout", async (req, res) => {
  await auth.destroySession(req.cookies?.[SESSION_COOKIE])
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions, maxAge: undefined })
  return res.status(204).end()
})

// ─────────────────────────────────────────── PIN management

api.post("/auth/pin", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return

  const body = z
    .object({ currentPin: z.string(), newPin: z.string() })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json({ ok: false, reason: "invalid" })

  const result = await auth.changePin(user, body.data.currentPin, body.data.newPin)
  if (!result.ok) return res.status(400).json({ ok: false, reason: result.reason })

  await audit(user.id, "pin.changed", "user", user.id, {}, req.ip)
  return res.json({ ok: true })
})

/** Verify a PIN without performing a transaction — used by the frontend to pre-check. */
api.post("/auth/pin/verify", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return

  const body = z.object({ pin: z.string() }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ ok: false, reason: "invalid" })

  const check = await auth.verifyPin(user, body.data.pin)
  return res.json(check.ok ? { ok: true } : { ok: false, reason: check.reason })
})

// ─────────────────────────────────────────── account / session

api.get("/me", async (req, res) => {
  const user = await auth.sessionUser(req.cookies?.[SESSION_COOKIE])
  return res.json(user ? await toUserDto(user) : null)
})

api.get("/balance", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return

  const balance = await transactionsService.balanceOf(user)
  return res.json({
    usd: balance.toString(),
    asset: "USDC",
    chainId: config.BASE_CHAIN_ID,
  })
})

// ─────────────────────────────────────────── user lookup

api.get("/users/username/:username", async (req, res) => {
  await requireUser(req, res)
  const user = await accounts.findByUsername(String(req.params.username).toLowerCase())
  if (!user || !user.active) return res.json({ found: false, reason: "not_found" })
  return res.json({ found: true, user: toPublicUserDto(user) })
})

api.get("/users/phone/:phone", async (req, res) => {
  await requireUser(req, res)
  const phone = normalizePhone(String(req.params.phone))
  if (!phone) return res.json({ found: false, reason: "invalid" })
  const user = await accounts.findByPhone(phone)
  if (!user || !user.active) return res.json({ found: false, reason: "not_found" })
  return res.json({ found: true, user: toPublicUserDto(user) })
})

api.get("/resolve", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return

  const result = await accounts.resolveRecipient(String(req.query.q ?? ""), user.id)
  return res.json(
    result.ok
      ? { found: true, user: toPublicUserDto(result.value.user) }
      : { found: false, reason: result.reason === "not_found" ? "not_found" : "invalid" },
  )
})

api.get("/recipients/recent", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return

  const people = await transactionsService.recentCounterparties(user.id)
  return res.json(people.map(toPublicUserDto))
})

// ─────────────────────────────────────────── OTP resend

api.post("/auth/otp/resend", async (req, res) => {
  const body = z.object({ phone: z.string() }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: "invalid" })

  const phone = normalizePhone(body.data.phone)
  if (!phone) return res.status(400).json({ error: "invalid" })

  const result = await auth.requestOtp(phone)

  if (result.smsError && !result.code) {
    console.error("[otp/resend] SMS error:", result.smsError)
    return res.status(503).json({
      error: "sms_unavailable",
      message: isProduction
        ? "SMS delivery is currently unavailable. Please try again later."
        : `SMS configuration error: ${result.smsError}`,
    })
  }

  return res.json(
    result.code
      ? { sent: true, devCode: result.code }
      : { sent: true },
  )
})

// ─────────────────────────────────────────── banks

api.get("/banks", async (_req, res) => {
  try {
    const provider = bankProvider()
    // PaystackBankProvider: refresh the live list from Paystack (cached server-side)
    if ("refreshBanks" in provider && typeof (provider as { refreshBanks: () => Promise<unknown> }).refreshBanks === "function") {
      const banks = await (provider as { refreshBanks: () => Promise<unknown> }).refreshBanks()
      return res.json(banks)
    }
    return res.json(provider.listBanks())
  } catch (err) {
    console.error("[banks] failed to fetch bank list:", err instanceof Error ? err.message : err)
    // Return cached list if available, or empty array
    const provider = bankProvider()
    const cached = provider.listBanks()
    if (cached.length > 0) return res.json(cached)
    return res.status(503).json({ error: "bank_list_unavailable" })
  }
})

api.post("/banks/resolve", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return

  const body = z
    .object({
      bankCode: z.string(),
      accountNumber: z.string(),
    })
    .safeParse(req.body)

  if (!body.success) return res.status(400).json({ success: false, reason: "invalid" })

  const provider = bankProvider()
  const result = await provider.resolveAccount(body.data.bankCode, body.data.accountNumber)
  return res.json(result)
})

// ─────────────────────────────────────────── quotes

api.post("/quotes", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return

  const body = z
    .object({
      /** USDC amount in base units as a string */
      amount: z.string(),
    })
    .safeParse(req.body)

  if (!body.success) return res.status(400).json({ ok: false, reason: "invalid" })

  const amount = parseBaseUnits(body.data.amount)
  if (amount === null) return res.status(400).json({ ok: false, reason: "invalid" })

  let result
  try {
    result = await quotesService.createQuote({ user, amountUsdc: amount })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[quotes] createQuote threw unexpectedly:", msg)
    return res.status(503).json({
      ok: false,
      reason: "fx_unavailable",
      message: "Unable to fetch the current exchange rate. Please try again.",
    })
  }

  if (!result.ok) {
    // Log fx/quote failures so we can diagnose rate-feed issues server-side
    console.error("[quotes] createQuote failed:", result.reason)
    return res.status(400).json({ ok: false, reason: result.reason })
  }

  const q = result.value
  return res.json({
    ok: true,
    quote: {
      id: q.id,
      asset: "USDC",
      amount: q.amountUsdc.toString(),
      fxRate: q.fxRate,
      feeNgn: q.feeNgn.toString(),
      ngnAmountGross: q.ngnAmountGross.toString(),
      ngnAmount: q.ngnAmountNet.toString(),
      expiresAt: q.expiresAt.toISOString(),
    },
  })
})

// ─────────────────────────────────────────── transactions

api.post("/transactions", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return

  const body = z
    .discriminatedUnion("recipientType", [
      z.object({
        recipientType: z.literal("xpay_user"),
        recipient: z.string(),
        quoteId: z.string(),
        memo: z.string().max(60).optional(),
        pin: z.string(),
        idempotencyKey: z.string().max(128).optional(),
      }),
      z.object({
        recipientType: z.literal("bank_account"),
        bankCode: z.string(),
        accountNumber: z.string(),
        accountName: z.string(),
        quoteId: z.string(),
        memo: z.string().max(60).optional(),
        pin: z.string(),
        idempotencyKey: z.string().max(128).optional(),
      }),
    ])
    .safeParse(req.body)

  if (!body.success) return res.status(400).json({ ok: false, reason: "invalid" })

  const data = body.data

  const result =
    data.recipientType === "xpay_user"
      ? await transactionsService.sendToUser({
          from: user,
          recipient: data.recipient,
          quoteId: data.quoteId,
          memo: data.memo,
          pin: data.pin,
          idempotencyKey: data.idempotencyKey,
        })
      : await transactionsService.sendToBank({
          from: user,
          bankCode: data.bankCode,
          accountNumber: data.accountNumber,
          accountName: data.accountName,
          quoteId: data.quoteId,
          memo: data.memo,
          pin: data.pin,
          idempotencyKey: data.idempotencyKey,
        })

  if (!result.ok) return res.status(400).json({ ok: false, reason: result.reason })

  return res.status(201).json({
    ok: true,
    transaction: toTransactionDto(result.value.transaction, user.id),
    confirmed: result.value.confirmed,
  })
})

api.get("/transactions", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return

  const rows = await transactionsService.history(user.id)
  return res.json(rows.map((r) => toTransactionDto(r, user.id)))
})

api.get("/transactions/:id", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return

  const row = await transactionsService.byId(user.id, String(req.params.id))
  if (!row) return res.status(404).json({ error: "not_found" })

  const payout = await payoutsService.byTransactionId(row.id)
  return res.json({
    ...toTransactionDto(row, user.id),
    payout: payout ? toPayoutDto(payout) : null,
  })
})

// ─────────────────────────────────────────── payouts

api.get("/payouts", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return

  const rows = await payoutsService.history(user.id)
  return res.json(rows.map(toPayoutDto))
})

api.get("/payouts/:id", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return

  const row = await payoutsService.byId(user.id, String(req.params.id))
  if (!row) return res.status(404).json({ error: "not_found" })
  return res.json(toPayoutDto(row))
})

// ─────────────────────────────────────────── linked bank accounts

api.get("/bank-accounts", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return

  const rows = await bankAccountsService.getUserBankAccounts(user.id)
  return res.json(rows.map(toBankAccountDto))
})

api.post("/bank-accounts", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return

  const body = z
    .object({
      bankCode: z.string(),
      accountNumber: z.string(),
      setAsDefault: z.boolean().optional(),
    })
    .safeParse(req.body)

  if (!body.success) return res.status(400).json({ ok: false, reason: "invalid" })

  const result = await bankAccountsService.linkBankAccount(
    user,
    body.data.bankCode,
    body.data.accountNumber,
    body.data.setAsDefault ?? true,
  )

  if (!result.ok) return res.status(400).json({ ok: false, reason: result.reason })
  return res.status(201).json({ ok: true, bankAccount: toBankAccountDto(result.value) })
})

// ─────────────────────────────────────────── dev helpers

api.post("/dev/fund", async (req, res) => {
  if (isProduction) return res.status(404).end()

  const user = await requireUser(req, res)
  if (!user) return

  const amount = parseBaseUnits(String(req.body?.amount ?? "40000000"))
  if (amount === null) return res.status(400).json({ error: "invalid" })

  await transactionsService.fund(user, amount)
  return res.json({ usd: (await transactionsService.balanceOf(user)).toString() })
})

// ─────────────────────────────────────────── webhooks

/**
 * Paystack webhook endpoint.
 *
 * Receives transfer status updates and updates our payout + transaction tables.
 * Signature is verified using HMAC-SHA512 before any processing.
 *
 * The raw body must be used for signature verification, so this route uses
 * express.raw() instead of express.json() to get the unparsed bytes.
 */
api.post(
  "/webhooks/paystack",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["x-paystack-signature"] as string | undefined
    if (!signature) {
      return res.status(400).json({ error: "missing_signature" })
    }

    const rawBody = req.body instanceof Buffer ? req.body.toString("utf8") : JSON.stringify(req.body)

    // Verify signature using HMAC-SHA512 with PAYSTACK_SECRET_KEY
    const { createHmac } = await import("node:crypto")
    const expected = createHmac("sha512", config.PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest("hex")

    if (expected !== signature) {
      return res.status(401).json({ error: "invalid_signature" })
    }

    let event: { event: string; data: Record<string, unknown> }
    try {
      event = JSON.parse(rawBody)
    } catch {
      return res.status(400).json({ error: "invalid_json" })
    }

    // Respond 200 immediately — Paystack will retry if we don't acknowledge
    res.status(200).json({ received: true })

    // Process asynchronously so a slow DB write never delays Paystack's retry timer
    void processPaystackEvent(event).catch((err) => {
      console.error("[webhook] Paystack event processing error:", err)
    })
  },
)

async function processPaystackEvent(event: {
  event: string
  data: Record<string, unknown>
}): Promise<void> {
  if (event.event !== "transfer.success" && event.event !== "transfer.failed" && event.event !== "transfer.reversed") {
    return // Ignore unrelated events
  }

  const data = event.data
  const reference = data.reference as string | undefined
  if (!reference) return

  const { payouts, transactions } = await import("../../db/schema.js")
  const { eq } = await import("drizzle-orm")

  // Find the payout by provider reference (idempotency key = payoutId = reference)
  const [payout] = await db
    .select()
    .from(payouts)
    .where(eq(payouts.providerReference, reference))

  if (!payout) {
    // Try by idempotency key (the reference we sent to Paystack)
    const [byIdem] = await db
      .select()
      .from(payouts)
      .where(eq(payouts.idempotencyKey, reference))
    if (!byIdem) return
  }

  const targetPayout = payout ?? (
    await db.select().from(payouts).where(eq(payouts.idempotencyKey, reference)).then(([r]) => r)
  )
  if (!targetPayout) return

  let newPayoutStatus: string
  let newTxStatus: string

  switch (event.event) {
    case "transfer.success":
      newPayoutStatus = "completed"
      newTxStatus = "completed"
      break
    case "transfer.failed":
      newPayoutStatus = "failed"
      newTxStatus = "payout_failed"
      break
    case "transfer.reversed":
      newPayoutStatus = "reversed"
      newTxStatus = "payout_failed"
      break
    default:
      return
  }

  // Idempotency: skip if already in terminal state
  if (targetPayout.status === newPayoutStatus) return

  await db
    .update(payouts)
    .set({
      status: newPayoutStatus,
      providerResponse: data as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(payouts.id, targetPayout.id))

  await db
    .update(transactions)
    .set({ status: newTxStatus, updatedAt: new Date() })
    .where(eq(transactions.id, targetPayout.transactionId))

  await audit(
    targetPayout.userId,
    `webhook.paystack.${event.event}`,
    "payout",
    targetPayout.id,
    { event: event.event, reference, status: newPayoutStatus },
  )
}

// ─────────────────────────────────────────── DTO serializers

type UserDto = {
  id: string
  phone: string
  username: string
  displayName: string
  walletAddress?: string
}

async function toUserDto(u: UserRow): Promise<UserDto> {
  const wallet = await accounts.findWallet(u.id)
  return {
    id: u.id,
    phone: u.phone,
    username: u.username,
    displayName: u.displayName,
    walletAddress: wallet?.walletAddress ?? undefined,
  }
}

function toPublicUserDto(u: UserRow) {
  return {
    username: u.username,
    displayName: u.displayName,
  }
}

function toTransactionDto(row: import("../../db/schema.js").TransactionRow, viewerId: string) {
  // External deposits have senderId === recipientId (self-to-self). Always show as "in".
  const isExternalDeposit = row.senderId === row.recipientId
  const isOutgoing = !isExternalDeposit && row.senderId === viewerId
  return {
    id: row.id,
    direction: isOutgoing ? "out" : "in",
    recipientType: row.recipientType,
    recipientDisplayName: row.recipientDisplayName,
    recipientBankName: row.recipientBankName,
    recipientAccountNumberLast4: row.recipientAccountNumberLast4,
    asset: row.asset,
    amount: row.amount.toString(),
    chainId: row.chainId,
    txHash: row.txHash,
    status: row.status,
    feeNgn: row.feeNgn.toString(),
    fxRate: row.fxRate,
    ngnAmount: row.ngnAmount.toString(),
    memo: row.memo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toPayoutDto(p: import("../../db/schema.js").PayoutRow) {
  return {
    id: p.id,
    transactionId: p.transactionId,
    provider: p.provider,
    amountNgn: p.amountNgn.toString(),
    bankName: p.bankName,
    bankAccountNumber: p.bankAccountNumber,
    accountName: p.accountName,
    status: p.status,
    providerReference: p.providerReference,
    createdAt: p.createdAt.toISOString(),
  }
}

function toBankAccountDto(b: import("../../db/schema.js").BankAccountRow) {
  return {
    id: b.id,
    bankCode: b.bankCode,
    bankName: b.bankName,
    accountNumberLast4: b.accountNumberLast4,
    accountName: b.accountName,
    isDefault: b.isDefault,
    verificationStatus: b.verificationStatus,
  }
}

export { toUserDto, toPublicUserDto }

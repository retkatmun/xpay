import { and, desc, eq, or, sql } from "drizzle-orm"
import { db } from "../db/index.js"
import {
  transactions,
  walletAccounts,
  users,
  type TransactionRow,
  type UserRow,
} from "../db/schema.js"
import { newId } from "../lib/ids.js"
import { fail, ok, type Result } from "../lib/errors.js"
import { resolveRecipient } from "./accounts.js"
import { verifyPin } from "./auth.js"
import { getQuote, consumeQuote } from "./quotes.js"
import { chain } from "../chain/index.js"
import { config } from "../config.js"
import { audit } from "./audit.js"
import { bankByCode, isValidAccountNumber } from "../providers/bank/index.js"

/**
 * Transaction service.
 *
 * Handles cross-border USDC → NGN transactions, including:
 * - XPay user → XPay user transfers
 * - XPay user → Nigerian bank account transfers (via treasury wallet)
 *
 * State machine:
 * created → awaiting_payment → blockchain_detected → blockchain_confirmed →
 * payout_pending → payout_processing → completed
 *
 * Failure states: expired | cancelled | blockchain_failed | payout_failed | manual_review
 */

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  created: ["awaiting_payment", "cancelled", "expired"],
  awaiting_payment: ["blockchain_detected", "expired", "cancelled"],
  blockchain_detected: ["blockchain_confirmed", "blockchain_failed"],
  blockchain_confirmed: ["payout_pending", "payout_failed"],
  payout_pending: ["payout_processing", "payout_failed"],
  payout_processing: ["completed", "payout_failed", "manual_review"],
  completed: [],
  expired: [],
  cancelled: [],
  blockchain_failed: [],
  payout_failed: [],
  manual_review: ["payout_pending", "payout_failed", "completed"],
}

export function isValidTransition(from: string, to: string): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to)
}

export async function advanceStatus(
  txId: string,
  newStatus: string,
  extra?: Partial<TransactionRow>,
): Promise<TransactionRow | null> {
  const [current] = await db.select().from(transactions).where(eq(transactions.id, txId))
  if (!current) return null

  if (!isValidTransition(current.status, newStatus)) {
    throw new Error(`Invalid transaction status transition: ${current.status} → ${newStatus}`)
  }

  const [updated] = await db
    .update(transactions)
    .set({ status: newStatus, updatedAt: new Date(), ...extra })
    .where(eq(transactions.id, txId))
    .returning()

  return updated ?? null
}

// ─────────────────────────────────────────── send to XPay user

export type SendToUserInput = {
  from: UserRow
  recipient: string
  quoteId: string
  memo?: string
  pin: string
  idempotencyKey?: string
}

export type SendOutput = {
  transaction: TransactionRow
  confirmed: boolean
}

export async function sendToUser(input: SendToUserInput): Promise<Result<SendOutput>> {
  const { from, idempotencyKey } = input

  if (idempotencyKey) {
    const existing = await findByIdempotencyKey(idempotencyKey)
    if (existing) return ok({ transaction: existing, confirmed: existing.status === "completed" })
  }

  const resolved = await resolveRecipient(input.recipient, from.id)
  if (!resolved.ok) return fail(resolved.reason)
  const to = resolved.value.user

  const pinCheck = await verifyPin(from, input.pin)
  if (!pinCheck.ok) return fail(pinCheck.reason)

  const quote = await getQuote(input.quoteId, from.id)
  if (!quote) return fail("quote_expired")

  const [toWallet] = await db.select().from(walletAccounts).where(eq(walletAccounts.userId, to.id))
  if (!toWallet) return fail("invalid")

  const [fromWallet] = await db.select().from(walletAccounts).where(eq(walletAccounts.userId, from.id))
  if (!fromWallet) return fail("invalid")

  const adapter = await chain()
  // Use ledger balance (DB-computed) — the treasury custody model means the user's
  // on-chain deposit address balance may not reflect pending XPay debits.
  const balance = await balanceOf(from)
  if (balance < quote.amountUsdc) return fail("insufficient")

  const consumed = await consumeQuote(quote.id)
  if (!consumed) return fail("quote_expired")

  const txId = newId("tx")
  const [row] = await db
    .insert(transactions)
    .values({
      id: txId,
      senderId: from.id,
      recipientId: to.id,
      recipientType: "xpay_user",
      recipientDisplayName: to.displayName,
      asset: "USDC",
      amount: quote.amountUsdc,
      chainId: adapter.chainId,
      status: "awaiting_payment",
      feeNgn: quote.feeNgn,
      fxRate: quote.fxRate,
      ngnAmountGross: quote.ngnAmountGross,
      ngnAmount: quote.ngnAmountNet,
      quoteId: quote.id,
      memo: input.memo?.trim().slice(0, 60) ?? null,
      idempotencyKey: idempotencyKey ?? null,
      updatedAt: new Date(),
    })
    .returning()

  if (!row) return fail("invalid")

  await audit(from.id, "transaction.created", "transaction", txId, {
    recipientId: to.id,
    amount: quote.amountUsdc.toString(),
    fxRate: quote.fxRate,
  })

  try {
    const outcome = await adapter.transfer({
      fromAddress: fromWallet.walletAddress,
      toAddress: toWallet.walletAddress,
      amount: quote.amountUsdc,
      confirmBudgetMs: config.CONFIRM_BUDGET_MS,
    })

    const finalStatus = outcome.confirmed ? "completed" : "blockchain_detected"
    const [updated] = await db
      .update(transactions)
      .set({ txHash: outcome.txHash, status: finalStatus, updatedAt: new Date() })
      .where(eq(transactions.id, txId))
      .returning()

    await audit(from.id, "transaction.completed", "transaction", txId, {
      txHash: outcome.txHash,
      status: finalStatus,
    })

    return ok({ transaction: updated ?? row, confirmed: outcome.confirmed })
  } catch (error) {
    await db.update(transactions).set({ status: "blockchain_failed", updatedAt: new Date() }).where(eq(transactions.id, txId))
    await audit(from.id, "transaction.failed", "transaction", txId, {
      reason: error instanceof Error ? error.message : "unknown",
    })
    if (isInsufficientFunds(error)) return fail("insufficient")
    return fail("chain_error")
  }
}

// ─────────────────────────────────────────── send to bank account

export type SendToBankInput = {
  from: UserRow
  bankCode: string
  accountNumber: string
  accountName: string
  quoteId: string
  memo?: string
  pin: string
  idempotencyKey?: string
}

export async function sendToBank(input: SendToBankInput): Promise<Result<SendOutput>> {
  const { from, idempotencyKey } = input

  if (idempotencyKey) {
    const existing = await findByIdempotencyKey(idempotencyKey)
    if (existing) return ok({ transaction: existing, confirmed: false })
  }

  if (!isValidAccountNumber(input.accountNumber)) return fail("invalid")
  const bank = bankByCode(input.bankCode)
  if (!bank) return fail("invalid")

  const pinCheck = await verifyPin(from, input.pin)
  if (!pinCheck.ok) return fail(pinCheck.reason)

  const quote = await getQuote(input.quoteId, from.id)
  if (!quote) return fail("quote_expired")

  const [fromWallet] = await db.select().from(walletAccounts).where(eq(walletAccounts.userId, from.id))
  if (!fromWallet) return fail("invalid")

  const adapter = await chain()
  // Use ledger balance (DB-computed) for the same reason as sendToUser.
  const balance = await balanceOf(from)
  if (balance < quote.amountUsdc) return fail("insufficient")

  const consumed = await consumeQuote(quote.id)
  if (!consumed) return fail("quote_expired")

  const txId = newId("tx")
  const [row] = await db
    .insert(transactions)
    .values({
      id: txId,
      senderId: from.id,
      recipientId: null,
      recipientType: "bank_account",
      recipientDisplayName: input.accountName,
      recipientBankCode: input.bankCode,
      recipientBankName: bank.name,
      recipientAccountNumberLast4: input.accountNumber.slice(-4),
      recipientAccountName: input.accountName,
      asset: "USDC",
      amount: quote.amountUsdc,
      chainId: adapter.chainId,
      status: "awaiting_payment",
      feeNgn: quote.feeNgn,
      fxRate: quote.fxRate,
      ngnAmountGross: quote.ngnAmountGross,
      ngnAmount: quote.ngnAmountNet,
      quoteId: quote.id,
      memo: input.memo?.trim().slice(0, 60) ?? null,
      idempotencyKey: idempotencyKey ?? null,
      updatedAt: new Date(),
    })
    .returning()

  if (!row) return fail("invalid")

  await audit(from.id, "transaction.created", "transaction", txId, {
    recipientType: "bank_account",
    bankCode: input.bankCode,
    amount: quote.amountUsdc.toString(),
    fxRate: quote.fxRate,
  })

  try {
    // For bank transfers the sender pays USDC to the treasury wallet.
    // The treasury wallet later initiates the NGN payout to the bank account.
    // This is the custody model: XPay holds USDC on behalf of the transaction.
    const treasuryAddress = adapter.kind === "base_sepolia"
      ? (adapter as import("../chain/baseSepolia.js").BaseSepoliaChain).treasuryWalletAddress
      : fromWallet.walletAddress // mock: no separate treasury

    const outcome = await adapter.transfer({
      fromAddress: fromWallet.walletAddress,
      toAddress: treasuryAddress,
      amount: quote.amountUsdc,
      confirmBudgetMs: config.CONFIRM_BUDGET_MS,
    })

    const blockchainStatus = outcome.confirmed ? "blockchain_confirmed" : "blockchain_detected"
    const [updated] = await db
      .update(transactions)
      .set({ txHash: outcome.txHash, status: blockchainStatus, updatedAt: new Date() })
      .where(eq(transactions.id, txId))
      .returning()

    // Trigger payout asynchronously if blockchain is confirmed
    if (outcome.confirmed) {
      void triggerPayout(txId, from.id, input, quote)
    }

    return ok({ transaction: updated ?? row, confirmed: false })
  } catch (error) {
    await db.update(transactions).set({ status: "blockchain_failed", updatedAt: new Date() }).where(eq(transactions.id, txId))
    await audit(from.id, "transaction.blockchain_failed", "transaction", txId, {
      reason: error instanceof Error ? error.message : "unknown",
    })
    if (isInsufficientFunds(error)) return fail("insufficient")
    return fail("chain_error")
  }
}

/** Check if an error is an insufficient-funds error from any chain adapter. */
function isInsufficientFunds(err: unknown): boolean {
  return err instanceof Error && (
    err.constructor.name === "InsufficientFunds" ||
    err.message.toLowerCase().includes("insufficient")
  )
}

/**
 * Trigger the NGN payout leg for a bank transfer.
 * Called fire-and-forget after blockchain confirmation.
 * Errors are caught and written to the transaction status — never bubble.
 */
async function triggerPayout(
  txId: string,
  userId: string,
  input: SendToBankInput,
  quote: NonNullable<Awaited<ReturnType<typeof getQuote>>>,
): Promise<void> {
  const { payoutProvider } = await import("../providers/payout/index.js")
  const { payouts } = await import("../db/schema.js")

  const provider = payoutProvider()

  try {
    await db.update(transactions).set({ status: "payout_pending", updatedAt: new Date() }).where(eq(transactions.id, txId))

    // Step 1: Create/retrieve the Paystack transfer recipient
    const { recipientCode } = await provider.createRecipient({
      accountName: input.accountName,
      accountNumber: input.accountNumber,
      bankCode: input.bankCode,
    })

    await db.update(transactions).set({ status: "payout_processing", updatedAt: new Date() }).where(eq(transactions.id, txId))

    // Step 2: Initiate the transfer
    const payoutId = newId("po")
    const payoutResult = await provider.initiatePayout({
      reference: payoutId,
      recipientCode,
      bankCode: input.bankCode,
      accountNumber: input.accountNumber,
      accountName: input.accountName,
      amountNgn: quote.ngnAmountNet,
      narration: `XPay transfer ${txId.slice(-8)}`,
    })

    const payoutStatus = payoutResult.success ? payoutResult.status : "failed"
    const providerRef = payoutResult.success ? payoutResult.providerReference : null
    const transferCode = payoutResult.success ? payoutResult.transferCode : null

    await db.insert(payouts).values({
      id: payoutId,
      transactionId: txId,
      userId,
      provider: provider.name,
      amountNgn: quote.ngnAmountNet,
      bankCode: input.bankCode,
      bankName: bankByCode(input.bankCode)?.name ?? input.bankCode,
      bankAccountNumber: input.accountNumber,
      accountName: input.accountName,
      status: payoutStatus,
      providerReference: providerRef,
      providerResponse: payoutResult.success
        ? { transferCode, transferId: payoutResult.transferId, status: payoutResult.status }
        : { reason: payoutResult.reason, message: (payoutResult as { message?: string }).message },
      idempotencyKey: `payout_${txId}`,
      updatedAt: new Date(),
    })

    // Payout status from Paystack is usually "processing" (not yet "completed").
    // The transaction stays in payout_processing until a webhook updates it.
    const finalTxStatus = payoutResult.success ? "payout_processing" : "payout_failed"
    await db.update(transactions).set({ status: finalTxStatus, updatedAt: new Date() }).where(eq(transactions.id, txId))

    await audit(userId, "payout.initiated", "payout", payoutId, {
      txId,
      provider: provider.name,
      status: payoutStatus,
    })
  } catch (error) {
    await db.update(transactions).set({ status: "payout_failed", updatedAt: new Date() }).where(eq(transactions.id, txId))
    await audit(userId, "payout.failed", "transaction", txId, {
      error: error instanceof Error ? error.message : "unknown",
    })
  }
}

// ─────────────────────────────────────────── queries

function findByIdempotencyKey(key: string): Promise<TransactionRow | null> {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.idempotencyKey, key))
    .then(([row]) => row ?? null)
}

export async function history(userId: string, limit = 100): Promise<TransactionRow[]> {
  return db
    .select()
    .from(transactions)
    .where(or(eq(transactions.senderId, userId), eq(transactions.recipientId, userId)))
    .orderBy(desc(transactions.createdAt))
    .limit(limit)
}

export async function byId(userId: string, id: string): Promise<TransactionRow | null> {
  const [row] = await db
    .select()
    .from(transactions)
    .where(
      sql`${transactions.id} = ${id} and (${transactions.senderId} = ${userId} or ${transactions.recipientId} = ${userId})`,
    )
  return row ?? null
}

export async function recentCounterparties(userId: string, max = 4): Promise<UserRow[]> {
  const rows = await history(userId, 40)
  const seen = new Set<string>()
  const out: UserRow[] = []

  for (const t of rows) {
    const otherId = t.senderId === userId ? t.recipientId : t.senderId
    if (!otherId || seen.has(otherId)) continue
    seen.add(otherId)
    const [user] = await db.select().from(users).where(eq(users.id, otherId))
    if (user) out.push(user)
    if (out.length >= max) break
  }

  return out
}

export async function balanceOf(user: UserRow): Promise<bigint> {
  // In the treasury custody model, all USDC is held by the treasury wallet.
  // The user's "balance" is computed from the DB ledger:
  //   credits = external deposits (recipientId = user, senderId = user, recipientType = xpay_user, status = completed)
  //   debits  = outbound transfers (senderId = user, status = completed)
  //
  // For external deposits, DepositScanner inserts rows with senderId = recipientId = userId.
  // For XPay→XPay, the sender row has senderId = user, recipientId = other user.
  // For bank payouts, senderId = user, recipientId = null.
  //
  // This is the standard custodial ledger model — same as Coinbase/Binance.
  // The on-chain source of truth is only used by DepositScanner to detect inflows.

  // Sum all completed credits to this user (deposits and received transfers)
  const creditRows = await db
    .select({ amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        eq(transactions.recipientId, user.id),
        eq(transactions.status, "completed"),
        // Exclude self-referencing deposits that aren't real external credits
        // (External deposits have senderId = recipientId = user)
        // Both internal transfers TO this user and external deposits count as credits
      ),
    )

  // Sum all completed debits from this user (outbound transfers)
  const debitRows = await db
    .select({ amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        eq(transactions.senderId, user.id),
        eq(transactions.status, "completed"),
        // Exclude self-to-self rows (external deposits: senderId = recipientId)
        sql`${transactions.recipientId} IS DISTINCT FROM ${transactions.senderId}`,
      ),
    )

  const credits = creditRows.reduce((sum, r) => sum + r.amount, 0n)
  const debits = debitRows.reduce((sum, r) => sum + r.amount, 0n)
  return credits > debits ? credits - debits : 0n
}

export async function fund(user: UserRow, amount: bigint): Promise<void> {
  const adapter = await chain()
  const [wallet] = await db.select().from(walletAccounts).where(eq(walletAccounts.userId, user.id))
  if (!wallet) throw new Error("No wallet found for user")
  await adapter.mint(wallet.walletAddress, amount)
}

import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

/**
 * XPay schema.
 *
 * Postgres is the application's source of truth for users, sessions, and off-chain state.
 * The blockchain is the source of truth for USDC balances and payment proofs.
 * These two sources of truth are reconciled via the transactions table.
 */

// ─────────────────────────────────────────── users

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),

    /** E.164, e.g. "+2348031234567". The identity a telco can vouch for. */
    phone: text("phone").notNull(),

    /** Bare label — "suleiman". The ".xpay" suffix is presentation, never storage. */
    username: text("username").notNull(),

    displayName: text("display_name").notNull(),

    /** argon2id. Never the PIN itself, and never logged. */
    pinHash: text("pin_hash").notNull(),

    /** Consecutive failures. Reset on success. */
    pinAttempts: integer("pin_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),

    /** False disables the account without deleting the history. */
    active: boolean("active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_phone_key").on(t.phone),
    uniqueIndex("users_username_key").on(t.username),
  ],
)

// ─────────────────────────────────────────── wallet_accounts
// Custodial wallets managed by XPay on behalf of users.
// Each user can have one wallet per chain. The private key is never stored —
// it is derived from the treasury at request time and discarded.

export const walletAccounts = pgTable(
  "wallet_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),

    /** EIP-155 chain ID, e.g. 84532 for Base Sepolia. */
    chainId: integer("chain_id").notNull(),

    /** 0x-prefixed EVM address. */
    walletAddress: text("wallet_address").notNull(),

    /** "active" | "frozen" */
    status: text("status").notNull().default("active"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("wallet_accounts_user_chain_key").on(t.userId, t.chainId),
    uniqueIndex("wallet_accounts_address_key").on(t.walletAddress),
    index("wallet_accounts_user_idx").on(t.userId),
  ],
)

// ─────────────────────────────────────────── bank_accounts
// Nigerian bank accounts linked to an XPay user for NGN payout.
// Account numbers are stored encrypted; the key is in the environment.

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),

    bankCode: text("bank_code").notNull(),
    bankName: text("bank_name").notNull(),

    /**
     * The raw account number is encrypted at rest with AES-256-GCM.
     * The ciphertext is stored here; the key is in SESSION_SECRET / a KMS.
     * We store the last 4 digits in plaintext for display purposes only.
     */
    accountNumberEncrypted: text("account_number_encrypted").notNull(),
    accountNumberLast4: text("account_number_last4").notNull(),
    accountName: text("account_name").notNull(),

    /** "verified" | "pending" | "failed" */
    verificationStatus: text("verification_status").notNull().default("verified"),

    /** Whether this is the default bank for payouts. */
    isDefault: boolean("is_default").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bank_accounts_user_idx").on(t.userId),
  ],
)

// ─────────────────────────────────────────── transactions
// The core transaction record. Each transaction represents a cross-border
// remittance: USDC sent by the sender, NGN received by the recipient.

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),

    /** The XPay user sending the money. */
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id),

    /**
     * For XPay-to-XPay transfers, the recipient user ID.
     * Null when sending to a bank account (recipient may not have XPay).
     */
    recipientId: text("recipient_id").references(() => users.id),

    /** "xpay_user" | "bank_account" */
    recipientType: text("recipient_type").notNull(),

    // Recipient identity for display, preserved even if the recipient account is later deleted.
    recipientDisplayName: text("recipient_display_name").notNull(),
    recipientBankCode: text("recipient_bank_code"),
    recipientBankName: text("recipient_bank_name"),
    recipientAccountNumberLast4: text("recipient_account_number_last4"),
    recipientAccountName: text("recipient_account_name"),

    /** The asset being sent, e.g. "USDC". */
    asset: text("asset").notNull().default("USDC"),

    /**
     * USDC amount in base units (6 decimals). 1_000_000 = $1.00.
     * Always positive; direction is derived from sender/recipient relationship.
     */
    amount: bigint("amount", { mode: "bigint" }).notNull(),

    /** The EIP-155 chain ID the payment was made on. */
    chainId: integer("chain_id"),

    /** On-chain transaction hash. Null until blockchain payment is detected. */
    txHash: text("tx_hash"),

    /**
     * Transaction state machine:
     * created → awaiting_payment → blockchain_detected → blockchain_confirmed →
     * conversion_processing → payout_pending → payout_processing → completed
     *
     * Failure states: expired | rejected | blockchain_failed | payout_failed | cancelled | manual_review
     */
    status: text("status").notNull().default("created"),

    /** Platform fee in NGN (whole naira). */
    feeNgn: bigint("fee_ngn", { mode: "bigint" }).notNull().default(0n),

    /** FX rate applied at quote time (NGN per USD). */
    fxRate: integer("fx_rate").notNull(),

    /** NGN amount the recipient receives (after fee deduction). */
    ngnAmount: bigint("ngn_amount", { mode: "bigint" }).notNull(),

    /** NGN amount before fee deduction (gross). */
    ngnAmountGross: bigint("ngn_amount_gross", { mode: "bigint" }).notNull(),

    /** The quote ID this transaction was created from. Used to verify quote hasn't expired. */
    quoteId: text("quote_id"),

    memo: text("memo"),

    /**
     * Idempotency key. The unique index is what prevents double-submission —
     * not a check-then-insert, which races.
     */
    idempotencyKey: text("idempotency_key"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("transactions_idempotency_key").on(t.idempotencyKey),
    index("transactions_sender_idx").on(t.senderId, t.createdAt),
    index("transactions_recipient_idx").on(t.recipientId, t.createdAt),
    uniqueIndex("transactions_tx_hash_key").on(t.txHash),
  ],
)

// ─────────────────────────────────────────── payouts
// NGN payouts to Nigerian bank accounts. One payout per transaction.

export const payouts = pgTable(
  "payouts",
  {
    id: text("id").primaryKey(),

    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id),

    userId: text("user_id")
      .notNull()
      .references(() => users.id),

    /** The provider used for this payout, e.g. "mock", "paystack". */
    provider: text("provider").notNull().default("mock"),

    /** Amount in whole naira, as quoted at confirmation. */
    amountNgn: bigint("amount_ngn", { mode: "bigint" }).notNull(),

    bankCode: text("bank_code").notNull(),
    bankName: text("bank_name").notNull(),
    bankAccountNumber: text("bank_account_number").notNull(),
    accountName: text("account_name"),

    /** "pending" | "processing" | "completed" | "failed" | "simulated" */
    status: text("status").notNull().default("pending"),

    /** Provider-assigned reference for reconciliation. */
    providerReference: text("provider_reference"),

    /** Provider response payload, stored for audit. */
    providerResponse: jsonb("provider_response"),

    idempotencyKey: text("idempotency_key"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payouts_idempotency_key").on(t.idempotencyKey),
    uniqueIndex("payouts_transaction_key").on(t.transactionId),
    index("payouts_user_idx").on(t.userId, t.createdAt),
  ],
)

// ─────────────────────────────────────────── quotes
// FX quotes. Each quote is valid for a configurable TTL (default 5 minutes).
// A transaction must reference a valid quote.

export const quotes = pgTable(
  "quotes",
  {
    id: text("id").primaryKey(),

    /** The user who requested the quote. */
    userId: text("user_id")
      .notNull()
      .references(() => users.id),

    /** USDC amount in base units (6 decimals). */
    amountUsdc: bigint("amount_usdc", { mode: "bigint" }).notNull(),

    /** NGN per USD at quote time. */
    fxRate: integer("fx_rate").notNull(),

    /** Fee in NGN (whole naira). */
    feeNgn: bigint("fee_ngn", { mode: "bigint" }).notNull(),

    /** Gross NGN before fee deduction. */
    ngnAmountGross: bigint("ngn_amount_gross", { mode: "bigint" }).notNull(),

    /** Net NGN after fee deduction — what the recipient actually receives. */
    ngnAmountNet: bigint("ngn_amount_net", { mode: "bigint" }).notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("quotes_user_idx").on(t.userId, t.createdAt),
  ],
)

// ─────────────────────────────────────────── audit_logs
// Immutable audit trail. Append-only — rows are never updated or deleted.

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),

    /** The user who performed the action, if authenticated. */
    actorId: text("actor_id"),

    /** What happened, e.g. "transaction.created", "pin.changed", "login.success". */
    action: text("action").notNull(),

    /** The resource type affected, e.g. "transaction", "user", "payout". */
    resource: text("resource"),

    /** The resource ID. */
    resourceId: text("resource_id"),

    /** Additional context. Never put secrets here. */
    metadata: jsonb("metadata"),

    /** Request IP, for security audit purposes. */
    ipAddress: text("ip_address"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_actor_idx").on(t.actorId, t.createdAt),
    index("audit_logs_resource_idx").on(t.resource, t.resourceId),
    index("audit_logs_action_idx").on(t.action, t.createdAt),
  ],
)

// ─────────────────────────────────────────── auth tables

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: text("id").primaryKey(),
    phone: text("phone").notNull(),
    /** Hashed — an OTP is a credential, and the table is as sensitive as a password store. */
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("otp_phone_idx").on(t.phone, t.createdAt)],
)

/**
 * Proof that a phone number was verified, issued by OTP verification and consumed by signup.
 */
export const signupTokens = pgTable("signup_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  phone: text("phone").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
})

export const webSessions = pgTable(
  "web_sessions",
  {
    /** Only the hash is stored, so a database dump cannot be replayed as a live session. */
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("web_sessions_user_idx").on(t.userId)],
)

// ─────────────────────────────────────────── mock chain support

/**
 * Balances for the mock chain adapter.
 *
 * This table stands in for on-chain USDC state. Services always go through
 * ChainAdapter, so swapping to real Base Sepolia leaves this table orphaned
 * rather than requiring a migration of business data.
 */
export const mockBalances = pgTable("mock_balances", {
  address: text("address").primaryKey(),
  amount: bigint("amount", { mode: "bigint" }).notNull().default(sql`0`),
})

// ─────────────────────────────────────────── deposit scan cursors
// Tracks the highest block the deposit scanner has processed per chain.
// One row per chainId — upserted after each successful scan window.

export const depositScanCursors = pgTable("deposit_scan_cursors", {
  /** EIP-155 chain ID, e.g. 84532 for Base Sepolia. Primary key. */
  chainId: integer("chain_id").primaryKey(),

  /**
   * The last block number fully scanned. The next scan window starts
   * at lastScannedBlock + 1. Stored as bigint to handle future chains
   * with very high block numbers.
   */
  lastScannedBlock: bigint("last_scanned_block", { mode: "bigint" }).notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─────────────────────────────────────────── inferred types

export type UserRow = typeof users.$inferSelect
export type WalletAccountRow = typeof walletAccounts.$inferSelect
export type BankAccountRow = typeof bankAccounts.$inferSelect
export type TransactionRow = typeof transactions.$inferSelect
export type PayoutRow = typeof payouts.$inferSelect
export type QuoteRow = typeof quotes.$inferSelect
export type AuditLogRow = typeof auditLogs.$inferSelect
export type DepositScanCursorRow = typeof depositScanCursors.$inferSelect

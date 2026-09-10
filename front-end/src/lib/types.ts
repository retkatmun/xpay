/**
 * XPay wire types.
 *
 * These mirror the shape the Node backend returns. Amounts cross this boundary
 * as decimal strings in base units (6-decimal USDC), because JSON has no bigint.
 * Convert with BigInt() on arrival — never Number().
 */

export type User = {
  id: string
  /** E.164, e.g. "+2348031234567" */
  phone: string
  /** Without the leading "@" */
  username: string
  displayName: string
  /** On-chain USDC deposit address (Base Sepolia) */
  walletAddress?: string
}

/** A user as seen by someone else — no contact details. */
export type PublicUser = {
  username: string
  displayName: string
}

export type Balance = {
  /** Base units as a string, e.g. "40000000" = $40.00 USDC */
  usd: string
  /** EIP-155 chain ID */
  chainId: number
  asset: "USDC"
}

export type Quote = {
  id: string
  asset: "USDC"
  /** Base units as a string */
  amount: string
  fxRate: number
  /** NGN fee, as a string */
  feeNgn: string
  /** Gross NGN before fee */
  ngnAmountGross: string
  /** Net NGN after fee — what the recipient actually receives */
  ngnAmount: string
  expiresAt: string
}

export type TransactionStatus =
  | "created"
  | "awaiting_payment"
  | "blockchain_detected"
  | "blockchain_confirmed"
  | "conversion_processing"
  | "payout_pending"
  | "payout_processing"
  | "completed"
  | "expired"
  | "rejected"
  | "blockchain_failed"
  | "payout_failed"
  | "cancelled"
  | "manual_review"

export type Transaction = {
  id: string
  direction: "in" | "out"
  recipientType: "xpay_user" | "bank_account"
  recipientDisplayName: string
  recipientBankName?: string | null
  recipientAccountNumberLast4?: string | null
  asset: "USDC"
  /** Base units as a string */
  amount: string
  chainId?: number | null
  txHash?: string | null
  status: TransactionStatus
  /** Fee in NGN as a string */
  feeNgn: string
  fxRate: number
  /** Net NGN received, as a string */
  ngnAmount: string
  memo?: string | null
  createdAt: string
  updatedAt: string
  payout?: Payout | null
}

export type Payout = {
  id: string
  transactionId: string
  provider: string
  amountNgn: string
  bankName: string
  bankAccountNumber: string
  accountName?: string | null
  status: string
  providerReference?: string | null
  createdAt: string
}

export type BankResolveResult =
  | {
      success: true
      bankCode: string
      bankName: string
      accountNumber: string
      accountName: string
    }
  | {
      success: false
      reason: "invalid_account" | "bank_not_found" | "provider_error" | "not_found" | "rate_limited"
    }

export type Bank = {
  code: string
  name: string
}

export type ResolveResult =
  | { found: true; user: PublicUser }
  | { found: false; reason: "not_found" | "invalid" }

export type SendResult =
  | { ok: true; transaction: Transaction; confirmed: boolean }
  | { ok: false; reason: "wrong_pin" | "locked" | "insufficient" | "not_found" | "quote_expired" | "chain_error" | "invalid" | "server_error" | string }

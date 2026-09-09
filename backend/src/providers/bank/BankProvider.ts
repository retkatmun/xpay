/**
 * BankProvider abstraction.
 *
 * All Nigerian bank operations go through this interface.
 * Production: PaystackBankProvider
 * Tests only: MockBankProvider
 */

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
      message?: string
    }

export interface BankProvider {
  readonly name: string

  /**
   * Verify a Nigerian bank account and return the holder's name.
   * Never invent or guess an account name — return success:false if resolution fails.
   */
  resolveAccount(bankCode: string, accountNumber: string): Promise<BankResolveResult>

  /**
   * Return the current list of supported Nigerian banks.
   * Mock: returns synchronously from in-memory list.
   * Production: returns from cached list (may be empty until refreshed).
   */
  listBanks(): Bank[]
}

export type Bank = {
  code: string
  name: string
}

/** Ten digits — the NUBAN format every Nigerian bank uses. */
export function isValidAccountNumber(input: string): boolean {
  return /^\d{10}$/.test(input.trim())
}

/** Canonical list of active Nigerian banks (NUBAN-compatible). */
export const NIGERIAN_BANKS: Bank[] = [
  // ── Paystack test bank — works in test mode with any 10-digit account number ──
  { code: "001", name: "Paystack Test Bank (dev only)" },
  // ── Real Nigerian banks ───────────────────────────────────────────────────────
  { code: "044", name: "Access Bank" },
  { code: "014", name: "Afribank Nigeria" },
  { code: "063", name: "Access Bank (Diamond)" },
  { code: "050", name: "EcoBank Nigeria" },
  { code: "040", name: "Ecobank Nigeria" },
  { code: "070", name: "Fidelity Bank" },
  { code: "011", name: "First Bank of Nigeria" },
  { code: "214", name: "First City Monument Bank" },
  { code: "058", name: "GTBank" },
  { code: "030", name: "Heritage Bank" },
  { code: "301", name: "Jaiz Bank" },
  { code: "082", name: "Keystone Bank" },
  { code: "526", name: "Parallex Bank" },
  { code: "076", name: "Polaris Bank" },
  { code: "101", name: "Providus Bank" },
  { code: "221", name: "Stanbic IBTC Bank" },
  { code: "068", name: "Standard Chartered" },
  { code: "232", name: "Sterling Bank" },
  { code: "100", name: "Suntrust Bank" },
  { code: "302", name: "TAJ Bank" },
  { code: "032", name: "Union Bank of Nigeria" },
  { code: "033", name: "United Bank for Africa" },
  { code: "215", name: "Unity Bank" },
  { code: "035", name: "Wema Bank" },
  { code: "057", name: "Zenith Bank" },
]

import { isTest } from "../../config.js"
import type { BankProvider } from "./BankProvider.js"
import { NIGERIAN_BANKS } from "./BankProvider.js"
import { PaystackBankProvider } from "./PaystackBankProvider.js"
import { MockBankProvider } from "./MockBankProvider.js"

export type { BankProvider, BankResolveResult, Bank } from "./BankProvider.js"
export { isValidAccountNumber } from "./BankProvider.js"

let instance: BankProvider | null = null

/**
 * Returns the configured bank provider.
 *
 * Production / Development: PaystackBankProvider (requires PAYSTACK_SECRET_KEY)
 * Tests (NODE_ENV=test):    MockBankProvider
 *
 * MockBankProvider is NEVER used outside of tests.
 */
export function bankProvider(): BankProvider {
  if (instance) return instance
  instance = isTest ? new MockBankProvider() : new PaystackBankProvider()
  return instance
}

/**
 * Look up a bank by its Paystack bank code.
 *
 * Falls back to the static NIGERIAN_BANKS list (sufficient for all CBN-registered banks).
 * In production the live Paystack list may have more entries — use bankProvider().listBanks()
 * for a user-facing list, and this function for code→name resolution in service layer.
 */
export function bankByCode(code: string): { code: string; name: string } | undefined {
  // Try the live provider cache first (populated after first resolveAccount call).
  const liveBanks = bankProvider().listBanks()
  if (liveBanks.length > 0) {
    const live = liveBanks.find((b) => b.code === code)
    if (live) return live
  }
  // Fall back to static list.
  return NIGERIAN_BANKS.find((b) => b.code === code)
}

/** Reset the singleton — for tests only. */
export function resetBankProvider(): void {
  instance = null
}

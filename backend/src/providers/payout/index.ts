import { isTest } from "../../config.js"
import type { PayoutProvider } from "./PayoutProvider.js"
import { PaystackPayoutProvider } from "./PaystackPayoutProvider.js"
import { MockPayoutProvider } from "./MockPayoutProvider.js"

export type { PayoutProvider, PayoutRequest, PayoutResult } from "./PayoutProvider.js"
export { PaystackPayoutProvider } from "./PaystackPayoutProvider.js"

let instance: PayoutProvider | null = null

/**
 * Returns the configured payout provider.
 *
 * Production / Development: PaystackPayoutProvider
 * Tests (NODE_ENV=test):    MockPayoutProvider
 *
 * MockPayoutProvider is NEVER used outside of tests.
 */
export function payoutProvider(): PayoutProvider {
  if (instance) return instance
  instance = isTest ? new MockPayoutProvider() : new PaystackPayoutProvider()
  return instance
}

/** Reset the singleton — for tests only. */
export function resetPayoutProvider(): void {
  instance = null
}

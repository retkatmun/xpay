import { isTest } from "../../config.js"
import type { FXProvider } from "./FXProvider.js"
import { MockFXProvider } from "./MockFXProvider.js"
import { RealFXProvider } from "./RealFXProvider.js"

export type { FXProvider, FXRate } from "./FXProvider.js"

let instance: FXProvider | null = null

/**
 * Returns the configured FX provider.
 *
 * Production / Development: RealFXProvider (fetches live USD/NGN rate)
 * Tests (NODE_ENV=test):    MockFXProvider (hardcoded ₦1,560 rate — no network)
 *
 * MockFXProvider is NEVER used outside of tests.
 */
export function fxProvider(): FXProvider {
  if (instance) return instance
  instance = isTest ? new MockFXProvider() : new RealFXProvider()
  return instance
}

/** Reset the singleton — for tests only. */
export function resetFxProvider(): void {
  instance = null
}

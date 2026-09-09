import type { FXProvider, FXRate } from "./FXProvider.js"

/**
 * MockFXProvider.
 *
 * Returns a fixed NGN rate for use in unit tests and local development.
 * Replace this with a real FX feed (e.g. RealFXProvider) for production.
 *
 * Rate is intentionally plausible for NGN/USDC as of mid-2025 (₦1,560 per $1).
 */

/** Hardcoded mock rate: 1 USDC ≈ ₦1,560 (realistic mid-2025 figure). */
const MOCK_NGN_RATE = 1560

export class MockFXProvider implements FXProvider {
  readonly name = "mock"

  async getRate(base: string, quote: string): Promise<FXRate> {
    // Only supports USDC → NGN for now.
    if (base !== "USDC" || quote !== "NGN") {
      throw new Error(`Unsupported currency pair: ${base}/${quote}`)
    }

    return {
      base,
      quote,
      rate: MOCK_NGN_RATE,
      timestamp: new Date(),
      provider: this.name,
    }
  }
}

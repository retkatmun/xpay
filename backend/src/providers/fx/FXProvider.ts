/**
 * FXProvider abstraction.
 *
 * All FX rate lookups go through this interface, so a real exchange rate feed
 * can be plugged in later without changing the quote engine.
 */

export type FXRate = {
  /** Base currency, e.g. "USDC" */
  base: string
  /** Quote currency, e.g. "NGN" */
  quote: string
  /** Rate: 1 unit of base buys this many units of quote */
  rate: number
  /** When this rate was fetched */
  timestamp: Date
  /** Which provider supplied the rate */
  provider?: string
}

export interface FXProvider {
  readonly name: string

  /**
   * Get the current exchange rate between two currencies.
   * For XPay MVP: USDC → NGN.
   */
  getRate(base: string, quote: string): Promise<FXRate>
}

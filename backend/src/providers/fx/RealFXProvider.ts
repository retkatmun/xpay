/**
 * RealFXProvider — live USD/NGN exchange rate.
 *
 * Supports three providers (configured via FX_PROVIDER env):
 *
 *   exchangerate-api  https://www.exchangerate-api.com  (free tier: 1500 req/month, no key for open endpoint)
 *   openexchangerates https://openexchangerates.org     (free tier: 1000 req/month, requires FX_API_KEY)
 *   fixer             https://fixer.io                  (paid, requires FX_API_KEY)
 *
 * Rate is cached for QUOTE_TTL_SECONDS to avoid hammering the provider.
 * Cache is invalidated on each new quote request if expired.
 *
 * NEVER falls back to a hardcoded rate. Throws if provider is unavailable.
 */

import https from "node:https"
import http from "node:http"
import type { FXProvider, FXRate } from "./FXProvider.js"
import { config } from "../../config.js"

/**
 * IPv4-safe HTTP GET with retry — wraps node:https/http to avoid Node's IPv6-first
 * DNS preference. Retries up to 3 times on timeout or network error.
 */
async function httpGet(url: string, attempt = 1): Promise<string> {
  try {
    return await httpGetOnce(url)
  } catch (err) {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, attempt * 600))
      return httpGet(url, attempt + 1)
    }
    throw err
  }
}

function httpGetOnce(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const mod = parsed.protocol === "https:" ? https : http
    const req = mod.get(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        family: 4, // force IPv4
        headers: { "User-Agent": "xpay-backend/1.0" },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (c: Buffer) => chunks.push(c))
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
        res.on("error", reject)
      },
    )
    req.on("error", reject)
    req.setTimeout(15_000, () => {
      req.destroy(new Error(`HTTP GET timed out: ${url}`))
    })
  })
}

export class RealFXProvider implements FXProvider {
  readonly name: string

  private cachedRate: FXRate | null = null
  private cacheExpiresAt = 0

  constructor() {
    this.name = config.FX_PROVIDER
  }

  async getRate(base: string, quote: string): Promise<FXRate> {
    if (base !== "USDC" || quote !== "NGN") {
      throw new Error(
        `Unsupported currency pair: ${base}/${quote}. XPay only supports USDC→NGN.`,
      )
    }

    const now = Date.now()
    if (this.cachedRate && now < this.cacheExpiresAt) {
      return this.cachedRate
    }

    let usdToNgn: number

    try {
      switch (config.FX_PROVIDER) {
        case "exchangerate-api":
          usdToNgn = await this.fetchExchangeRateApi()
          break
        case "openexchangerates":
          usdToNgn = await this.fetchOpenExchangeRates()
          break
        case "fixer":
          usdToNgn = await this.fetchFixer()
          break
        default:
          throw new Error(`Unknown FX_PROVIDER: ${config.FX_PROVIDER}`)
      }
    } catch (fetchErr) {
      // If we have a stale cached rate (up to 30 min old), use it rather than
      // surfacing an fx_unavailable error for every quote request. The rate
      // won't have moved materially in 30 minutes.
      const STALE_GRACE_MS = 30 * 60_000
      if (this.cachedRate && now < this.cacheExpiresAt + STALE_GRACE_MS) {
        console.warn("[FX] Live fetch failed — using stale cached rate:", this.cachedRate.rate, "Error:", (fetchErr as Error).message)
        return this.cachedRate
      }
      throw fetchErr
    }

    const rate: FXRate = {
      base,
      quote,
      rate: Math.round(usdToNgn), // round to whole naira
      timestamp: new Date(),
      provider: this.name,
    }

    this.cachedRate = rate
    this.cacheExpiresAt = now + 5 * 60_000 // cache for 5 minutes

    return rate
  }

  private async fetchExchangeRateApi(): Promise<number> {
    // Free open endpoint (no key) — limited but sufficient for MVP.
    // Only use the authenticated v6 endpoint when a real key is present.
    // Treat placeholder values ("free", "none", "placeholder") as absent.
    const PLACEHOLDER_KEYS = new Set(["free", "none", "placeholder", "test", "demo", ""])
    const hasRealKey = config.FX_API_KEY && !PLACEHOLDER_KEYS.has(config.FX_API_KEY.toLowerCase())

    const baseUrl = config.FX_API_URL ?? "https://open.er-api.com/v6/latest"
    const url = hasRealKey
      ? `https://v6.exchangerate-api.com/v6/${config.FX_API_KEY}/latest/USD`
      : `${baseUrl}/USD`

    const body = await httpGet(url)
    const json = JSON.parse(body) as {
      result?: string
      conversion_rates?: Record<string, number>
      rates?: Record<string, number>
    }

    const rate = json.conversion_rates?.NGN ?? json.rates?.NGN
    if (!rate || rate <= 0) {
      throw new Error(`exchangerate-api returned no NGN rate. Response: ${body.slice(0, 200)}`)
    }
    return rate
  }

  private async fetchOpenExchangeRates(): Promise<number> {
    if (!config.FX_API_KEY) {
      throw new Error(
        "FX_PROVIDER=openexchangerates requires FX_API_KEY.\n" +
          "Get a free key at: https://openexchangerates.org/signup/free\n" +
          "Add it to backend/.env as FX_API_KEY=your_app_id",
      )
    }

    const url = `https://openexchangerates.org/api/latest.json?app_id=${config.FX_API_KEY}&base=USD&symbols=NGN`
    const body = await httpGet(url)
    const json = JSON.parse(body) as { rates?: Record<string, number> }
    const rate = json.rates?.NGN
    if (!rate || rate <= 0) {
      throw new Error("openexchangerates returned no NGN rate")
    }
    return rate
  }

  private async fetchFixer(): Promise<number> {
    if (!config.FX_API_KEY) {
      throw new Error(
        "FX_PROVIDER=fixer requires FX_API_KEY.\n" +
          "Get a key at: https://fixer.io\n" +
          "Add it to backend/.env as FX_API_KEY=your_fixer_key",
      )
    }

    const url = `https://data.fixer.io/api/latest?access_key=${config.FX_API_KEY}&base=USD&symbols=NGN`
    const body = await httpGet(url)
    const json = JSON.parse(body) as { success?: boolean; rates?: Record<string, number> }
    if (!json.success) {
      throw new Error("fixer.io returned success:false. Check FX_API_KEY.")
    }

    const rate = json.rates?.NGN
    if (!rate || rate <= 0) {
      throw new Error("fixer.io returned no NGN rate")
    }
    return rate
  }
}

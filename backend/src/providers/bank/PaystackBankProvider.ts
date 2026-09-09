/**
 * PaystackBankProvider — real Nigerian bank data via Paystack API.
 *
 * Uses:
 *   GET  https://api.paystack.co/bank?currency=NGN   → list of supported banks
 *   GET  https://api.paystack.co/bank/resolve        → account name resolution
 *
 * Official docs: https://paystack.com/docs/transfers/single-transfers/
 */

import type { BankProvider, BankResolveResult, Bank } from "./BankProvider.js"
import { config } from "../../config.js"
import { isProduction } from "../../config.js"

/** Paystack test bank — resolves any 10-digit number without hitting the daily limit. */
const TEST_BANK: Bank = { code: "001", name: "Paystack Test Bank (dev only)" }

type PaystackBankListResponse = {
  status: boolean
  message: string
  data: Array<{
    id: number
    name: string
    code: string
    active: boolean
    currency: string
    type: string
  }>
}

type PaystackResolveResponse = {
  status: boolean
  message: string
  data?: {
    account_number: string
    account_name: string
    bank_id: number
  }
}

export class PaystackBankProvider implements BankProvider {
  readonly name = "paystack"

  private cachedBanks: Bank[] = []
  private cacheExpiresAt = 0

  private get headers() {
    return {
      Authorization: `Bearer ${config.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    }
  }

  /**
   * Returns the bank list synchronously from cache.
   * Cache is populated on the first resolveAccount() call or a manual refresh.
   * Returns an empty array if the cache has not been populated yet.
   */
  listBanks(): Bank[] {
    return this.cachedBanks
  }

  /** Fetch fresh bank list from Paystack and populate the cache. */
  async refreshBanks(): Promise<Bank[]> {
    const now = Date.now()
    if (this.cachedBanks.length > 0 && now < this.cacheExpiresAt) {
      return this.cachedBanks
    }

    const url = `${config.PAYSTACK_BASE_URL}/bank?currency=NGN&use_cursor=false&perPage=200`

    let res: Response
    try {
      res = await fetch(url, { headers: this.headers })
    } catch (err) {
      throw new Error(
        `Paystack unreachable while fetching bank list: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`Paystack bank list failed: HTTP ${res.status} — ${body.slice(0, 200)}`)
    }

    const json = (await res.json()) as PaystackBankListResponse

    if (!json.status || !Array.isArray(json.data)) {
      throw new Error(`Paystack bank list returned unexpected shape: ${JSON.stringify(json).slice(0, 200)}`)
    }

    const banks: Bank[] = json.data
      .filter((b) => b.active && b.currency === "NGN")
      .map((b) => ({ code: b.code, name: b.name }))
      .sort((a, b) => a.name.localeCompare(b.name))

    // In non-production, prepend the Paystack test bank (code 001).
    // It resolves any 10-digit account number without counting against the daily limit.
    if (!isProduction) {
      banks.unshift(TEST_BANK)
    }

    this.cachedBanks = banks
    this.cacheExpiresAt = now + config.PAYSTACK_BANK_CACHE_TTL * 1000

    return banks
  }

  async resolveAccount(bankCode: string, accountNumber: string): Promise<BankResolveResult> {
    // Ensure bank list is populated for name lookup
    if (this.cachedBanks.length === 0) {
      await this.refreshBanks().catch(() => {/* name lookup failure is non-fatal */})
    }
    const url = `${config.PAYSTACK_BASE_URL}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`

    let res: Response
    try {
      res = await fetch(url, { headers: this.headers })
    } catch (err) {
      return {
        success: false,
        reason: "provider_error",
        message: `Paystack unreachable: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    if (res.status === 422 || res.status === 400) {
      // Paystack returns 422 for invalid account numbers
      return { success: false, reason: "invalid_account" }
    }

    if (res.status === 404) {
      return { success: false, reason: "not_found" }
    }

    if (res.status === 429) {
      // Test mode: Paystack limits live bank resolves to 3/day.
      // Use test bank codes (001, 002, 003) in test mode, or switch to a live key.
      const body = await res.json().catch(() => ({ message: "" })) as { message?: string }
      return {
        success: false,
        reason: "rate_limited",
        message: body.message ?? "Paystack resolve limit reached",
      }
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      return {
        success: false,
        reason: "provider_error",
        message: `Paystack resolve failed: HTTP ${res.status}`,
      }
    }

    const json = (await res.json()) as PaystackResolveResponse

    if (!json.status || !json.data?.account_name) {
      return { success: false, reason: "not_found" }
    }

    // Find the bank name from cached list
    let bankName = bankCode
    try {
      const banks = this.listBanks()
      bankName = banks.find((b) => b.code === bankCode)?.name ?? bankCode
    } catch {
      // Bank name lookup failed — still return the resolved account
    }

    return {
      success: true,
      bankCode,
      bankName,
      accountNumber: json.data.account_number,
      accountName: json.data.account_name.toUpperCase(),
    }
  }
}

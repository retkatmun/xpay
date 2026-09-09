/**
 * XPay unit tests.
 *
 * These cover pure business logic: identity rules, money arithmetic,
 * transaction state machine, bank validation, and mock providers.
 *
 * Tests that need a real database (accounts, transfers, payouts) are
 * integration tests run separately against a live Postgres instance.
 */

import { describe, it, expect } from "vitest"

// ── Pure lib (no DB dependency) ──
import {
  normalizePhone,
  parseHandle,
  formatHandle,
  looksLikePhone,
  isWeakPin,
  isReserved,
  USERNAME_RULE,
  HANDLE_SUFFIX,
} from "../src/lib/identity.js"
import {
  parseAmount,
  parseBaseUnits,
  formatAmount,
  formatUSD,
  toNGN,
  formatNGN,
} from "../src/lib/money.js"

// ── State machine (pure function, no DB) ──
import { isValidTransition } from "../src/services/transactions.js"

// ── Bank validation helper (pure) ──
import { isValidAccountNumber } from "../src/providers/bank/BankProvider.js"

// ── Mock providers (no DB) ──
import { MockBankProvider } from "../src/providers/bank/MockBankProvider.js"
import { MockFXProvider } from "../src/providers/fx/MockFXProvider.js"
import { MockPayoutProvider } from "../src/providers/payout/MockPayoutProvider.js"

// ─────────────────────────────────────────── identity

describe("HANDLE_SUFFIX", () => {
  it("is .xpay (not .fundX)", () => {
    expect(HANDLE_SUFFIX).toBe(".xpay")
  })
})

describe("normalizePhone", () => {
  it("passes through valid E.164 Nigerian number", () => {
    expect(normalizePhone("+2348031234567")).toBe("+2348031234567")
  })
  it("normalises 0-prefix Nigerian number", () => {
    expect(normalizePhone("08031234567")).toBe("+2348031234567")
  })
  it("normalises 234-prefix without +", () => {
    expect(normalizePhone("2348031234567")).toBe("+2348031234567")
  })
  it("normalises bare 10-digit number", () => {
    expect(normalizePhone("8031234567")).toBe("+2348031234567")
  })
  it("strips spaces and dashes", () => {
    expect(normalizePhone("0803 123 4567")).toBe("+2348031234567")
  })
  it("returns null for garbage input", () => {
    expect(normalizePhone("not-a-phone")).toBeNull()
  })
  it("returns null for too-short number", () => {
    expect(normalizePhone("0803123")).toBeNull()
  })
})

describe("parseHandle", () => {
  it("accepts bare label", () => {
    expect(parseHandle("scholar")).toBe("scholar")
  })
  it("strips @ prefix", () => {
    expect(parseHandle("@scholar")).toBe("scholar")
  })
  it("strips .xpay suffix", () => {
    expect(parseHandle("scholar.xpay")).toBe("scholar")
  })
  it("strips .XPAY suffix case-insensitively", () => {
    expect(parseHandle("scholar.XPAY")).toBe("scholar")
  })
  it("rejects all-digit handle (reserved for phone numbers)", () => {
    expect(parseHandle("12345678")).toBeNull()
  })
  it("rejects too-short handles (<3 chars)", () => {
    expect(parseHandle("ab")).toBeNull()
  })
  it("rejects too-long handles (>16 chars)", () => {
    expect(parseHandle("averylonghandlethatexceedslimit")).toBeNull()
  })
})

describe("formatHandle", () => {
  it("appends .xpay suffix", () => {
    expect(formatHandle("scholar")).toBe("scholar.xpay")
  })
})

describe("looksLikePhone", () => {
  it("returns true for digit strings", () => {
    expect(looksLikePhone("0803 123 4567")).toBe(true)
    expect(looksLikePhone("+2348031234567")).toBe(true)
  })
  it("returns false for handles", () => {
    expect(looksLikePhone("scholar.xpay")).toBe(false)
    expect(looksLikePhone("@scholar")).toBe(false)
  })
})

describe("isWeakPin", () => {
  it("rejects all-same digits", () => {
    expect(isWeakPin("1111")).toBe(true)
    expect(isWeakPin("0000")).toBe(true)
  })
  it("rejects ascending sequences", () => {
    expect(isWeakPin("1234")).toBe(true)
    expect(isWeakPin("2345")).toBe(true)
  })
  it("rejects descending sequences", () => {
    expect(isWeakPin("9876")).toBe(true)
    expect(isWeakPin("8765")).toBe(true)
  })
  it("rejects non-4-digit strings", () => {
    expect(isWeakPin("123")).toBe(true)
    expect(isWeakPin("12345")).toBe(true)
    expect(isWeakPin("abcd")).toBe(true)
  })
  it("accepts strong 4-digit PINs", () => {
    expect(isWeakPin("3729")).toBe(false)
    expect(isWeakPin("8471")).toBe(false)
    expect(isWeakPin("6052")).toBe(false)
  })
})

describe("isReserved", () => {
  it("reserves xpay", () => expect(isReserved("xpay")).toBe(true))
  it("reserves admin", () => expect(isReserved("admin")).toBe(true))
  it("reserves treasury", () => expect(isReserved("treasury")).toBe(true))
  it("does not reserve regular names", () => {
    expect(isReserved("scholar")).toBe(false)
    expect(isReserved("bola")).toBe(false)
  })
})

describe("USERNAME_RULE", () => {
  it("accepts valid handles", () => {
    expect(USERNAME_RULE.test("scholar")).toBe(true)
    expect(USERNAME_RULE.test("bola123")).toBe(true)
    expect(USERNAME_RULE.test("ada_eze")).toBe(true)
  })
  it("rejects handle starting with digit", () => {
    expect(USERNAME_RULE.test("1scholar")).toBe(false)
  })
  it("rejects handles with spaces", () => {
    expect(USERNAME_RULE.test("my handle")).toBe(false)
  })
  it("rejects too-short handles", () => {
    expect(USERNAME_RULE.test("ab")).toBe(false)
  })
  it("rejects too-long handles", () => {
    expect(USERNAME_RULE.test("a".repeat(17))).toBe(false)
  })
})

// ─────────────────────────────────────────── money

describe("parseAmount", () => {
  it("parses whole dollar amount", () => {
    expect(parseAmount("100")).toBe(100_000_000n)
  })
  it("parses dollars and cents", () => {
    expect(parseAmount("12.50")).toBe(12_500_000n)
  })
  it("parses small decimal", () => {
    expect(parseAmount("0.01")).toBe(10_000n)
  })
  it("parses max 6 decimal places", () => {
    expect(parseAmount("1.000001")).toBe(1_000_001n)
  })
  it("returns null for empty string", () => {
    expect(parseAmount("")).toBeNull()
  })
  it("returns null for letters", () => {
    expect(parseAmount("abc")).toBeNull()
  })
  it("returns null for more than 6 decimal places", () => {
    expect(parseAmount("1.1234567")).toBeNull()
  })
  it("handles comma-separated input", () => {
    expect(parseAmount("1,000")).toBe(1_000_000_000n)
  })
})

describe("parseBaseUnits", () => {
  it("parses integer string", () => {
    expect(parseBaseUnits("1000000")).toBe(1_000_000n)
  })
  it("parses zero", () => {
    expect(parseBaseUnits("0")).toBe(0n)
  })
  it("returns null for float string", () => {
    expect(parseBaseUnits("1.5")).toBeNull()
  })
  it("returns null for negative", () => {
    expect(parseBaseUnits("-100")).toBeNull()
  })
  it("returns null for empty", () => {
    expect(parseBaseUnits("")).toBeNull()
  })
})

describe("formatAmount", () => {
  it("formats $1.00", () => expect(formatAmount(1_000_000n)).toBe("1.00"))
  it("formats $1,500.00", () => expect(formatAmount(1_500_000_000n)).toBe("1,500.00"))
  it("truncates (does not round up)", () => expect(formatAmount(1_999_999n)).toBe("1.99"))
  it("formats zero", () => expect(formatAmount(0n)).toBe("0.00"))
})

describe("formatUSD", () => {
  it("prefixes with $", () => expect(formatUSD(1_000_000n)).toBe("$1.00"))
  it("handles $0", () => expect(formatUSD(0n)).toBe("$0.00"))
  it("handles negative (sign outside $)", () => expect(formatUSD(-1_000_000n)).toBe("-$1.00"))
})

describe("toNGN", () => {
  it("converts $1 at ₦1,560/$ rate", () => {
    expect(toNGN(1_000_000n, 1560)).toBe(1560n)
  })
  it("converts $100 at ₦1,560/$ rate", () => {
    expect(toNGN(100_000_000n, 1560)).toBe(156_000n)
  })
  it("is exact (bigint arithmetic, no float)", () => {
    // 3.333333 * 1560 = 5199.99... → truncates to 5199
    expect(toNGN(3_333_333n, 1560)).toBe(5199n)
  })
  it("returns 0 for 0 input", () => {
    expect(toNGN(0n, 1560)).toBe(0n)
  })
})

describe("formatNGN", () => {
  it("formats with ₦ and thousands separator", () => {
    expect(formatNGN(100_000_000n, 1560)).toBe("₦156,000")
  })
  it("formats negative with leading minus", () => {
    expect(formatNGN(-1_000_000n, 1560)).toBe("-₦1,560")
  })
})

// ─────────────────────────────────────────── transaction state machine

describe("isValidTransition", () => {
  it("allows created → awaiting_payment", () => {
    expect(isValidTransition("created", "awaiting_payment")).toBe(true)
  })
  it("allows awaiting_payment → blockchain_detected", () => {
    expect(isValidTransition("awaiting_payment", "blockchain_detected")).toBe(true)
  })
  it("allows blockchain_detected → blockchain_confirmed", () => {
    expect(isValidTransition("blockchain_detected", "blockchain_confirmed")).toBe(true)
  })
  it("allows payout_processing → completed", () => {
    expect(isValidTransition("payout_processing", "completed")).toBe(true)
  })
  it("allows cancellation from created", () => {
    expect(isValidTransition("created", "cancelled")).toBe(true)
  })
  it("rejects backward transitions", () => {
    expect(isValidTransition("completed", "created")).toBe(false)
  })
  it("rejects skip transitions", () => {
    expect(isValidTransition("created", "completed")).toBe(false)
  })
  it("allows failure: blockchain_detected → blockchain_failed", () => {
    expect(isValidTransition("blockchain_detected", "blockchain_failed")).toBe(true)
  })
  it("rejects all transitions from terminal states", () => {
    expect(isValidTransition("blockchain_failed", "awaiting_payment")).toBe(false)
    expect(isValidTransition("cancelled", "created")).toBe(false)
    expect(isValidTransition("expired", "awaiting_payment")).toBe(false)
  })
})

// ─────────────────────────────────────────── bank account number validation

describe("isValidAccountNumber", () => {
  it("accepts a valid 10-digit NUBAN", () => {
    expect(isValidAccountNumber("0123456789")).toBe(true)
  })
  it("rejects 9-digit number", () => {
    expect(isValidAccountNumber("012345678")).toBe(false)
  })
  it("rejects 11-digit number", () => {
    expect(isValidAccountNumber("01234567890")).toBe(false)
  })
  it("rejects numbers with letters", () => {
    expect(isValidAccountNumber("012345678a")).toBe(false)
  })
  it("trims surrounding whitespace", () => {
    expect(isValidAccountNumber("  0123456789  ")).toBe(true)
  })
})

// ─────────────────────────────────────────── MockBankProvider

describe("MockBankProvider", () => {
  const provider = new MockBankProvider()

  it("resolves a pre-seeded account (Access Bank / 0123456789)", async () => {
    const result = await provider.resolveAccount("044", "0123456789")
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.accountName).toBe("SCHOLAR GAMALIEL")
      expect(result.bankName).toBe("Access Bank")
      expect(result.bankCode).toBe("044")
    }
  })

  it("fails for invalid account number (9 digits)", async () => {
    const result = await provider.resolveAccount("044", "012345678")
    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toBe("invalid_account")
  })

  it("fails for unknown bank code", async () => {
    const result = await provider.resolveAccount("ZZZ", "0123456789")
    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toBe("bank_not_found")
  })

  it("generates a plausible name for unknown accounts", async () => {
    const result = await provider.resolveAccount("044", "0555555555")
    expect(result.success).toBe(true)
    if (result.success) {
      expect(typeof result.accountName).toBe("string")
      expect(result.accountName.length).toBeGreaterThan(3)
    }
  })

  it("lists banks including Access Bank and GTBank", () => {
    const banks = provider.listBanks()
    expect(banks.length).toBeGreaterThan(10)
    expect(banks.find((b) => b.code === "044")?.name).toBe("Access Bank")
    expect(banks.find((b) => b.code === "058")?.name).toBe("GTBank")
  })
})

// ─────────────────────────────────────────── MockFXProvider

describe("MockFXProvider", () => {
  const provider = new MockFXProvider()

  it("returns a positive USDC/NGN rate", async () => {
    const rate = await provider.getRate("USDC", "NGN")
    expect(rate.base).toBe("USDC")
    expect(rate.quote).toBe("NGN")
    expect(rate.rate).toBeGreaterThan(0)
    expect(rate.timestamp).toBeInstanceOf(Date)
  })

  it("throws for unsupported currency pairs", async () => {
    await expect(provider.getRate("BTC", "USD")).rejects.toThrow()
    await expect(provider.getRate("USDC", "USD")).rejects.toThrow()
  })
})

// ─────────────────────────────────────────── MockPayoutProvider

describe("MockPayoutProvider", () => {
  const provider = new MockPayoutProvider()

  it("initiates a payout and returns simulated status", async () => {
    const result = await provider.initiatePayout({
      reference: "test_ref_001",
      bankCode: "044",
      accountNumber: "0123456789",
      accountName: "SCHOLAR GAMALIEL",
      amountNgn: 156_000n,
      narration: "XPay test transfer tx_abc",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.status).toBe("simulated")
      expect(result.providerReference).toContain("mock_payout_")
    }
  })

  it("checkStatus returns simulated for mock references", async () => {
    const status = await provider.checkStatus("mock_payout_test_ref_001_12345")
    expect(status.status).toBe("simulated")
  })

  it("checkStatus returns unknown for unrecognised references", async () => {
    const status = await provider.checkStatus("real_provider_ref_xyz")
    expect(status.status).toBe("unknown")
  })
})

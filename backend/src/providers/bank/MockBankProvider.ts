/**
 * MockBankProvider.
 *
 * Simulates Nigerian bank account verification for development and testing.
 * Always succeeds for valid 10-digit account numbers, returning a mock account name.
 *
 * In production, replace this with a real provider (e.g. PaystackBankProvider).
 *
 * ⚠️ This must NEVER be used in production. The account names are fabricated.
 *    Real money must never be sent based on mock verification.
 */

import type { BankProvider, BankResolveResult, Bank } from "./BankProvider.js"
import { NIGERIAN_BANKS, isValidAccountNumber } from "./BankProvider.js"

/** Pre-seeded mock accounts for demo purposes. */
const MOCK_ACCOUNTS: Record<string, Record<string, string>> = {
  "044": {
    "0123456789": "SCHOLAR GAMALIEL",
    "0987654321": "AMAKA NWOSU",
    "0112233445": "CHIDI OKONKWO",
  },
  "058": {
    "0234567890": "BOLA ADEYEMI",
    "0345678901": "TUNDE BAKARE",
  },
  "057": {
    "0456789012": "IFEOMA EZE",
    "0567890123": "EMEKA DIKE",
  },
}

/**
 * Generate a plausible-looking Nigerian account name from an account number.
 * Used as a fallback when the account is not in MOCK_ACCOUNTS.
 */
function generateMockName(accountNumber: string): string {
  const firstNames = ["ADAEZE", "CHUKWUEMEKA", "OLUWASEUN", "FATIMA", "IBRAHIM", "NGOZI", "KOLAWOLE", "BLESSING"]
  const lastNames = ["OKAFOR", "ADELEKE", "IBRAHIM", "NWOSU", "JOHNSON", "OKONKWO", "BALOGUN", "ABUBAKAR"]
  const seed = parseInt(accountNumber.slice(-4), 10)
  const firstName = firstNames[seed % firstNames.length]
  const lastName = lastNames[Math.floor(seed / 10) % lastNames.length]
  return `${lastName} ${firstName}`
}

export class MockBankProvider implements BankProvider {
  readonly name = "mock"

  async resolveAccount(bankCode: string, accountNumber: string): Promise<BankResolveResult> {
    // Simulate network latency
    await new Promise((r) => setTimeout(r, 600))

    if (!isValidAccountNumber(accountNumber)) {
      return { success: false, reason: "invalid_account" }
    }

    const bank = NIGERIAN_BANKS.find((b) => b.code === bankCode)
    if (!bank) {
      return { success: false, reason: "bank_not_found" }
    }

    // Check pre-seeded mock accounts first
    const mockName = MOCK_ACCOUNTS[bankCode]?.[accountNumber]
    const accountName = mockName ?? generateMockName(accountNumber)

    return {
      success: true,
      bankCode: bank.code,
      bankName: bank.name,
      accountNumber,
      accountName,
    }
  }

  listBanks(): Bank[] {
    return NIGERIAN_BANKS
  }
}

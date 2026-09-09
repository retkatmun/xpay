/**
 * MockPayoutProvider.
 *
 * Simulates NGN bank payouts for development and testing.
 * All payouts succeed and are marked "simulated" — NOT "completed".
 *
 * ⚠️ This must NEVER be used in production. No real money moves.
 */

import type { PayoutProvider, PayoutRequest, PayoutResult } from "./PayoutProvider.js"

export class MockPayoutProvider implements PayoutProvider {
  readonly name = "mock"

  async createRecipient(params: {
    accountName: string
    accountNumber: string
    bankCode: string
  }): Promise<{ recipientCode: string }> {
    await new Promise((r) => setTimeout(r, 200))
    // Return a deterministic-looking mock recipient code
    return {
      recipientCode: `mock_rcpt_${params.bankCode}_${params.accountNumber.slice(-4)}`,
    }
  }

  async initiatePayout(request: PayoutRequest): Promise<PayoutResult> {
    // Simulate provider latency
    await new Promise((r) => setTimeout(r, 800))

    const mockRef = `mock_payout_${request.reference}_${Date.now()}`

    return {
      success: true,
      providerReference: mockRef,
      transferCode: `mock_tc_${request.reference}`,
      transferId: `mock_tid_${Date.now()}`,
      status: "simulated",
    }
  }

  async checkStatus(providerReference: string): Promise<{ status: string }> {
    await new Promise((r) => setTimeout(r, 200))
    return { status: providerReference.startsWith("mock_payout_") ? "simulated" : "unknown" }
  }
}

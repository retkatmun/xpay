/**
 * PayoutProvider abstraction.
 * Production: PaystackPayoutProvider
 * Tests only: MockPayoutProvider
 */

export type PayoutRequest = {
  reference: string
  recipientCode: string
  bankCode: string
  accountNumber: string
  accountName: string
  amountNgn: bigint
  narration: string
}

export type PayoutResult =
  | {
      success: true
      providerReference: string
      transferCode: string
      transferId: string
      status: string
    }
  | {
      success: false
      reason: "insufficient_funds" | "invalid_account" | "provider_error" | "provider_config_error"
      message?: string
    }

export interface PayoutProvider {
  readonly name: string

  createRecipient(params: {
    accountName: string
    accountNumber: string
    bankCode: string
  }): Promise<{ recipientCode: string }>

  initiatePayout(request: PayoutRequest): Promise<PayoutResult>

  checkStatus(transferCode: string): Promise<{ status: string; failureReason?: string }>
}

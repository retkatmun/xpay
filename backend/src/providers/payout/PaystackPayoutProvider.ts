/**
 * PaystackPayoutProvider — real NGN bank transfers via Paystack Transfers API.
 *
 * Flow:
 *  1. Create/retrieve transfer recipient  (POST /transferrecipient)
 *  2. Initiate transfer                   (POST /transfer)
 *  3. Verify via webhook or polling       (GET /transfer/:id)
 *
 * Official docs: https://paystack.com/docs/transfers/
 *
 * Requirements on the Paystack side (out-of-code setup):
 *   - Business account verified
 *   - Transfers enabled (Dashboard → Settings → Preferences)
 *   - OTP disabled OR auto-approve enabled for programmatic transfers
 *   - Balance funded in NGN
 */

import type { PayoutProvider, PayoutRequest, PayoutResult } from "./PayoutProvider.js"
import { config } from "../../config.js"
import { createHmac } from "node:crypto"

type PaystackRecipientResponse = {
  status: boolean
  message: string
  data?: {
    active: boolean
    createdAt: string
    currency: string
    domain: string
    id: number
    integration: number
    name: string
    recipient_code: string
    type: string
    updatedAt: string
    details: {
      account_number: string
      account_name: string
      bank_code: string
      bank_name: string
    }
  }
}

type PaystackTransferResponse = {
  status: boolean
  message: string
  data?: {
    integration: number
    domain: string
    amount: number
    currency: string
    source: string
    reason: string
    recipient: number
    status: string
    transfer_code: string
    id: number
    createdAt: string
    updatedAt: string
  }
}

type PaystackTransferVerifyResponse = {
  status: boolean
  message: string
  data?: {
    id: number
    domain: string
    amount: number
    currency: string
    source: string
    source_details: null
    reason: string
    recipient: { recipient_code: string; name: string }
    status: "otp" | "pending" | "success" | "failed" | "reversed"
    transfer_code: string
    reference: string
    createdAt: string
    updatedAt: string
    failures: null | Array<{ reason: string; error: string }>
    failure_reason: string | null
  }
}

export class PaystackPayoutProvider implements PayoutProvider {
  readonly name = "paystack"

  private get headers() {
    return {
      Authorization: `Bearer ${config.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    }
  }

  /** Step 1: Create or retrieve a transfer recipient. */
  async createRecipient(params: {
    accountName: string
    accountNumber: string
    bankCode: string
  }): Promise<{ recipientCode: string }> {
    const body = {
      type: "nuban",
      name: params.accountName,
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      currency: "NGN",
    }

    const res = await fetch(`${config.PAYSTACK_BASE_URL}/transferrecipient`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`Paystack create recipient failed: HTTP ${res.status} — ${text.slice(0, 200)}`)
    }

    const json = (await res.json()) as PaystackRecipientResponse

    if (!json.status || !json.data?.recipient_code) {
      throw new Error(`Paystack recipient creation returned unexpected shape: ${JSON.stringify(json).slice(0, 200)}`)
    }

    return { recipientCode: json.data.recipient_code }
  }

  /** Step 2: Initiate the NGN transfer. */
  async initiatePayout(request: PayoutRequest): Promise<PayoutResult> {
    // Amount in kobo (Paystack uses kobo for NGN)
    const amountKobo = Number(request.amountNgn) * 100

    const body = {
      source: "balance",
      amount: amountKobo,
      reference: request.reference,
      recipient: request.recipientCode,
      reason: request.narration,
    }

    let res: Response
    try {
      res = await fetch(`${config.PAYSTACK_BASE_URL}/transfer`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
      })
    } catch (err) {
      return {
        success: false,
        reason: "provider_error",
        message: `Paystack unreachable: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    if (res.status === 422) {
      // Insufficient balance or transfer not enabled
      const json = (await res.json().catch(() => ({ message: "unknown" }))) as { message: string }
      return {
        success: false,
        reason: "provider_config_error",
        message: json.message,
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        success: false,
        reason: "provider_error",
        message: `Paystack transfer failed: HTTP ${res.status} — ${text.slice(0, 200)}`,
      }
    }

    const json = (await res.json()) as PaystackTransferResponse

    if (!json.status || !json.data) {
      return {
        success: false,
        reason: "provider_error",
        message: `Paystack transfer returned unexpected shape`,
      }
    }

    const { transfer_code, id, status } = json.data

    return {
      success: true,
      providerReference: request.reference,
      transferCode: transfer_code,
      transferId: String(id),
      // "pending" on initiation — becomes "success" via webhook
      status: mapPaystackStatus(status),
    }
  }

  /** Check current status of a transfer. */
  async checkStatus(transferCode: string): Promise<{ status: string; failureReason?: string }> {
    const res = await fetch(`${config.PAYSTACK_BASE_URL}/transfer/${transferCode}`, {
      headers: this.headers,
    })

    if (!res.ok) {
      throw new Error(`Paystack transfer verify failed: HTTP ${res.status}`)
    }

    const json = (await res.json()) as PaystackTransferVerifyResponse

    if (!json.status || !json.data) {
      throw new Error(`Paystack transfer verify returned unexpected shape`)
    }

    return {
      status: mapPaystackStatus(json.data.status),
      failureReason: json.data.failure_reason ?? undefined,
    }
  }

  /** Verify a Paystack webhook signature. */
  static verifyWebhookSignature(payload: string, signature: string): boolean {
    const hash = createHmac("sha512", config.PAYSTACK_SECRET_KEY)
      .update(payload)
      .digest("hex")
    return hash === signature
  }
}

function mapPaystackStatus(paystackStatus: string): string {
  switch (paystackStatus) {
    case "success":
      return "completed"
    case "pending":
    case "otp":
      return "processing"
    case "failed":
      return "failed"
    case "reversed":
      return "reversed"
    default:
      return paystackStatus
  }
}

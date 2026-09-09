import type { SmsProvider } from "./SmsProvider.js"

/**
 * Termii SMS provider — https://termii.com
 *
 * Uses the Termii v3 Messaging API to send SMS to Nigerian numbers.
 * Get your API key from: https://accounts.termii.com/#/
 *
 * Required env vars:
 *   TERMII_API_KEY     — your Termii API key
 *   TERMII_SENDER_ID   — sender ID approved in your Termii account
 *   TERMII_CHANNEL     — "dnd" | "whatsapp" | "generic" (default: "dnd")
 *
 * Termii v3 API endpoint: POST https://v3.api.termii.com/api/v1/sms/send
 * (The old /api/sms/send path is not valid on v3 accounts.)
 */
export class TermiiSmsProvider implements SmsProvider {
  private readonly apiKey: string
  private readonly senderId: string
  private readonly channel: string
  private readonly baseUrl: string

  constructor(
    apiKey: string,
    senderId: string,
    channel = "dnd",
    baseUrl = "https://v4.api.termii.com",
  ) {
    this.apiKey = apiKey
    this.senderId = senderId
    this.channel = channel
    this.baseUrl = baseUrl
  }

  async sendSms(to: string, message: string): Promise<void> {
    // Termii expects numbers without a leading +
    const normalizedTo = to.startsWith("+") ? to.slice(1) : to

    const body = {
      to: normalizedTo,
      from: this.senderId,
      sms: message,
      type: "plain",
      api_key: this.apiKey,
      channel: this.channel,
    }

    let response: Response
    try {
      // Termii v3 correct path is /api/v1/sms/send
      response = await fetch(`${this.baseUrl}/api/v1/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    } catch (networkErr) {
      throw new Error(
        `Termii: network error — could not reach ${this.baseUrl} (${networkErr instanceof Error ? networkErr.message : networkErr})`,
      )
    }

    let data: Record<string, unknown>
    try {
      data = (await response.json()) as Record<string, unknown>
    } catch {
      throw new Error(`Termii: HTTP ${response.status} — response was not JSON`)
    }

    // Safe debug logging — never logs the API key or message content
    console.info(
      `[sms/termii] POST /api/v1/sms/send → HTTP ${response.status}`,
      `to=${normalizedTo} sender=${this.senderId} channel=${this.channel}`,
    )

    if (!response.ok) {
      // Termii v3 error shape: { status, error, message, fieldErrors? }
      const errMessage =
        typeof data.message === "string"
          ? data.message
          : typeof data.error === "string"
            ? data.error
            : response.statusText

      console.error(`[sms/termii] error response (HTTP ${response.status}):`, errMessage)
      throw new Error(`Termii: ${errMessage} (HTTP ${response.status})`)
    }

    // HTTP 200/201 success — Termii v3 returns { messageId, status, ... }
    // No further validation needed; a 2xx is a confirmed acceptance.
    console.info(`[sms/termii] accepted, messageId=${data.messageId ?? data.message_id ?? "(none)"}`)
  }
}

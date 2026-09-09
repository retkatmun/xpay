import { config } from "../../config.js"
import type { SmsProvider } from "./SmsProvider.js"
import { TermiiSmsProvider } from "./TermiiSmsProvider.js"

/**
 * Returns the configured SMS provider.
 *
 * If TERMII_API_KEY is set, uses Termii.
 * Otherwise, returns null — the caller decides whether to fall back to devCode.
 */
export function smsProvider(): SmsProvider | null {
  if (config.TERMII_API_KEY) {
    return new TermiiSmsProvider(
      config.TERMII_API_KEY,
      config.TERMII_SENDER_ID,
      config.TERMII_CHANNEL,
      config.TERMII_BASE_URL,
    )
  }
  return null
}

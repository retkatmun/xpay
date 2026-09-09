export interface SmsProvider {
  /** Send a plain-text SMS. Throws on failure. */
  sendSms(to: string, message: string): Promise<void>
}

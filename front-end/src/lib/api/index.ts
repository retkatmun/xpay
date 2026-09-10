/**
 * XPay API client.
 *
 * Every function here calls the real XPay backend.
 * No localStorage, no mock data, no fake transactions.
 *
 * API_URL is set via NEXT_PUBLIC_API_URL environment variable.
 * Defaults to http://localhost:4000 for local development.
 */

import type {
  Balance,
  Bank,
  BankResolveResult,
  PublicUser,
  Quote,
  ResolveResult,
  SendResult,
  Transaction,
  Payout,
  User,
} from "@/lib/types"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000"

// ── Helpers ──────────────────────────────────────────────────────────────────

class ApiError extends Error {
  readonly status: number
  readonly reason: string
  constructor(status: number, reason: string, message?: string) {
    super(message ?? `HTTP ${status}: ${reason}`)
    this.name = "ApiError"
    this.status = status
    this.reason = reason
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    // Network-level failure (offline, DNS failure, CORS, etc.)
    throw new ApiError(0, "network_error", `Could not reach server: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!res.ok) {
    let reason = "server_error"
    try {
      const json = (await res.json()) as { error?: string; reason?: string }
      reason = json.error ?? json.reason ?? reason
    } catch {
      /* ignore parse failure — keep reason as server_error */
    }
    throw new ApiError(res.status, reason)
  }

  // 204 No Content — return empty object
  if (res.status === 204) return {} as T

  return res.json() as Promise<T>
}

const get = <T>(path: string) => request<T>("GET", path)
const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body)

// ── Handle helpers (presentation only, no backend calls) ─────────────────────

export const USERNAME_RULE = /^[a-z][a-z0-9_]{2,15}$/
export const HANDLE_SUFFIX = ".xpay"

export function formatHandle(username: string): string {
  return `${username}${HANDLE_SUFFIX}`
}

export function parseHandle(input: string): string | null {
  const label = input
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/\.xpay$/i, "")
  return USERNAME_RULE.test(label) ? label : null
}

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "")
  if (/^\+234\d{10}$/.test(digits)) return digits
  if (/^234\d{10}$/.test(digits)) return `+${digits}`
  if (/^0\d{10}$/.test(digits)) return `+234${digits.slice(1)}`
  if (/^\d{10}$/.test(digits)) return `+234${digits}`
  if (/^\+\d{8,15}$/.test(digits)) return digits
  return null
}

export function prettyPhone(e164: string): string {
  if (/^\+234\d{10}$/.test(e164)) {
    const n = e164.slice(4)
    return `+234 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
  }
  return e164
}

// ── Onboarding ────────────────────────────────────────────────────────────────

export async function requestOtp(phone: string): Promise<{ sent: true; devCode?: string }> {
  const data = await post<{ sent: boolean; devCode?: string }>("/api/auth/otp/request", { phone })
  if (data.devCode) {
    console.info(`[dev] OTP code: ${data.devCode}`)
  }
  return { sent: true, devCode: data.devCode }
}

export async function verifyOtp(
  phone: string,
  code: string,
): Promise<{ ok: boolean; signupToken?: string }> {
  const data = await post<{ ok: boolean; signupToken?: string }>(
    "/api/auth/otp/verify",
    { phone, code },
  )
  if (!data.ok) return { ok: false }
  return { ok: true, signupToken: data.signupToken }
}

export async function checkUsername(
  username: string,
): Promise<{ available: boolean; reason?: "taken" | "reserved" | "invalid" }> {
  return get(`/api/auth/username/check?username=${encodeURIComponent(username)}`)
}

export async function createAccount(input: {
  signupToken: string
  username: string
  displayName: string
  pin: string
}): Promise<{ user: User }> {
  return post("/api/auth/signup", input)
}

// ── Session ───────────────────────────────────────────────────────────────────

export async function getSession(): Promise<User | null> {
  try {
    return await get<User | null>("/api/me")
  } catch {
    return null
  }
}

export async function login(input: {
  phone: string
  pin: string
}): Promise<{ user: User }> {
  return post("/api/auth/login", input)
}

export async function signOut(): Promise<void> {
  await post("/api/auth/signout")
}

// ── Balance ───────────────────────────────────────────────────────────────────

export async function getBalance(): Promise<Balance> {
  return get("/api/balance")
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function getTransactions(): Promise<Transaction[]> {
  return get("/api/transactions")
}

export async function getTransaction(id: string): Promise<(Transaction & { payout: Payout | null }) | null> {
  try {
    return await get(`/api/transactions/${encodeURIComponent(id)}`)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

// ── Recipient lookup ──────────────────────────────────────────────────────────

export async function resolveRecipient(query: string): Promise<ResolveResult> {
  try {
    const data = await get<{ found: boolean; user?: PublicUser; reason?: string }>(
      `/api/resolve?q=${encodeURIComponent(query)}`,
    )
    if (data.found && data.user) return { found: true, user: data.user }
    const reason = (data.reason ?? "not_found") as "not_found" | "invalid"
    return { found: false, reason }
  } catch {
    return { found: false, reason: "not_found" }
  }
}

export async function getRecentRecipients(): Promise<PublicUser[]> {
  try {
    return await get("/api/recipients/recent")
  } catch {
    return []
  }
}

// ── Banks ─────────────────────────────────────────────────────────────────────

export async function getBanks(): Promise<Bank[]> {
  return get("/api/banks")
}

export async function resolveBankAccount(
  bankCode: string,
  accountNumber: string,
): Promise<BankResolveResult> {
  return post("/api/banks/resolve", { bankCode, accountNumber })
}

// ── Quotes ────────────────────────────────────────────────────────────────────

export async function getQuote(amountUsdc: bigint): Promise<Quote> {
  const data = await post<{ ok: boolean; quote: Quote }>("/api/quotes", {
    amount: amountUsdc.toString(),
  })
  return data.quote
}

// ── Send money ────────────────────────────────────────────────────────────────

export async function sendToUser(input: {
  recipient: string
  quoteId: string
  memo?: string
  pin: string
  idempotencyKey?: string
}): Promise<SendResult> {
  try {
    const data = await post<{ ok: boolean; transaction: Transaction; confirmed: boolean }>(
      "/api/transactions",
      { recipientType: "xpay_user", ...input },
    )
    return { ok: true, transaction: data.transaction, confirmed: data.confirmed }
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, reason: err.reason }
    return { ok: false, reason: "server_error" }
  }
}

export async function sendToBank(input: {
  bankCode: string
  accountNumber: string
  accountName: string
  quoteId: string
  memo?: string
  pin: string
  idempotencyKey?: string
}): Promise<SendResult> {
  try {
    const data = await post<{ ok: boolean; transaction: Transaction; confirmed: boolean }>(
      "/api/transactions",
      { recipientType: "bank_account", ...input },
    )
    return { ok: true, transaction: data.transaction, confirmed: data.confirmed }
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, reason: err.reason }
    return { ok: false, reason: "server_error" }
  }
}

// ── PIN ───────────────────────────────────────────────────────────────────────

export async function verifyPin(pin: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    return await post("/api/auth/pin/verify", { pin })
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, reason: err.reason }
    return { ok: false, reason: "server_error" }
  }
}

// ── Dev helpers (non-production only) ─────────────────────────────────────────

/**
 * Fund the current user's wallet with mock USDC.
 * Only works when the backend is running with USE_MOCK_CHAIN=true.
 * Returns the new balance in base units as a string.
 */
export async function devFund(amountUsdc = 50_000_000n): Promise<{ usd: string }> {
  return post("/api/dev/fund", { amount: amountUsdc.toString() })
}

export { ApiError }

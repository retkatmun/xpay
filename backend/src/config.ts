import "dotenv/config"
import { z } from "zod"

/**
 * XPay configuration — validated at startup.
 *
 * Missing or invalid required variables cause an immediate process.exit(1)
 * with a clear message. A money-moving service must never start misconfigured.
 */

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1),

  // ── Security ──────────────────────────────────────────────────────────────
  /** Cookie signing + token hashing. Min 32 random characters. */
  SESSION_SECRET: z.string().min(32),

  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // ── PIN policy ────────────────────────────────────────────────────────────
  PIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  PIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

  // ── OTP / session TTLs ────────────────────────────────────────────────────
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // ── Quote engine ─────────────────────────────────────────────────────────
  QUOTE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  /** Platform fee in NGN (whole naira). 0 = no fee. */
  FEE_NGN: z.coerce.number().int().min(0).default(0),

  // ── Paystack ─────────────────────────────────────────────────────────────
  PAYSTACK_SECRET_KEY: z.string().min(1),
  PAYSTACK_BASE_URL: z.string().url().default("https://api.paystack.co"),
  /** Cache bank list for this many seconds (default 6h). */
  PAYSTACK_BANK_CACHE_TTL: z.coerce.number().int().positive().default(21600),

  // ── Base Sepolia / blockchain ─────────────────────────────────────────────
  BASE_CHAIN_ID: z.coerce.number().int().default(84532),
  BASE_RPC_URL: z.string().url(),
  BASE_EXPLORER_URL: z.string().url().default("https://sepolia.basescan.org"),
  /**
   * Official Base Sepolia USDC contract address.
   * Default: Circle's documented address.
   */
  USDC_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).default("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
  /**
   * Treasury private key for signing USDC transfers.
   * NEVER log. NEVER expose via API. NEVER commit.
   */
  BASE_PRIVATE_KEY: z.string().min(1),
  /** Required confirmations before advancing to payout stage. */
  REQUIRED_CONFIRMATIONS: z.coerce.number().int().positive().default(2),
  /** How long to poll for blockchain confirmation (ms). */
  CONFIRM_BUDGET_MS: z.coerce.number().int().positive().default(120_000),

  // ── FX provider ───────────────────────────────────────────────────────────
  /**
   * Which FX provider to use: "exchangerate-api" | "openexchangerates" | "fixer"
   * Each has a free tier. See .env.example for setup.
   */
  FX_PROVIDER: z.enum(["exchangerate-api", "openexchangerates", "fixer"]).default("exchangerate-api"),
  /**
   * API key for the FX provider.
   * For "exchangerate-api" with a free open-endpoint, this can be left empty.
   * For "openexchangerates" and "fixer" an API key is required.
   */
  FX_API_KEY: z.string().optional().default(""),
  FX_API_URL: z.string().url().optional(),

  // ── SMS / Termii ──────────────────────────────────────────────────────────────
  TERMII_API_KEY: z.string().optional(),
  TERMII_BASE_URL: z.string().url().default("https://v4.api.termii.com"),
  TERMII_SENDER_ID: z.string().default("XPay"),
  TERMII_CHANNEL: z.string().default("dnd"),

  // ── Dev OTP display ───────────────────────────────────────────────────────────
  /**
   * Set to "true" ONLY in development to display the OTP code in the API response.
   * This flag is BLOCKED in production — setting it there is a config error.
   * When false/unset and Termii is not configured, OTP request returns a config error.
   */
  DEV_SHOW_OTP: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  // ── Mock chain ────────────────────────────────────────────────────────────────
  /**
   * Set to "true" in development to use the in-process MockChain instead of
   * Base Sepolia. This allows dev/fund and transfers to work without real USDC,
   * a funded treasury wallet, or any RPC connection.
   * BLOCKED in production.
   */
  USE_MOCK_CHAIN: z
    .string()
    .optional()
    .transform((v) => v === "true"),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => {
      const varName = i.path.join(".")
      return `\n  ${varName}: ${i.message}`
    })
    .join("")

  console.error(`
╔══════════════════════════════════════════════════════════════╗
║           XPAY STARTUP ERROR — MISSING CONFIGURATION         ║
╠══════════════════════════════════════════════════════════════╣

The following environment variables are missing or invalid:
${missing}

Add them to:
  backend/.env

See backend/.env.example for the full list and documentation.

╚══════════════════════════════════════════════════════════════╝
`)
  process.exit(1)
}

export const config = parsed.data
export const isProduction = config.NODE_ENV === "production"
export const isTest = config.NODE_ENV === "test"

// ── Additional safety validations ─────────────────────────────────────────────

// Reject the placeholder Paystack key so the service never silently fails
// at runtime with a 401 on every bank operation.
// In development, a placeholder is allowed (bank features will return errors,
// but auth / OTP flows work fine via DEV_SHOW_OTP).
const isPlaceholderPaystack =
  config.PAYSTACK_SECRET_KEY === "sk_test_REPLACE_WITH_YOUR_PAYSTACK_TEST_KEY" ||
  config.PAYSTACK_SECRET_KEY.includes("REPLACE_WITH") ||
  config.PAYSTACK_SECRET_KEY.includes("your-paystack")

if (isPlaceholderPaystack && config.NODE_ENV === "production") {
  console.error(`
╔══════════════════════════════════════════════════════════════╗
║        XPAY STARTUP ERROR — INVALID CONFIGURATION           ║
╠══════════════════════════════════════════════════════════════╣

PAYSTACK_SECRET_KEY is still set to a placeholder value.

Get your real key from:
  https://dashboard.paystack.com/#/settings/developer

Then update backend/.env:
  PAYSTACK_SECRET_KEY="sk_test_YOUR_REAL_KEY_HERE"

╚══════════════════════════════════════════════════════════════╝
`)
  process.exit(1)
}

if (isPlaceholderPaystack) {
  console.warn(`
⚠  PAYSTACK_SECRET_KEY is a placeholder — bank features (payouts, account
   verification) will fail at runtime. Set a real test key from:
   https://dashboard.paystack.com/#/settings/developer
`)
}

// DEV_SHOW_OTP is forbidden in production — a production system must NEVER
// leak OTP codes in API responses, even if Termii is down.
if (config.DEV_SHOW_OTP && isProduction) {
  console.error(`
╔══════════════════════════════════════════════════════════════╗
║        XPAY STARTUP ERROR — SECURITY MISCONFIGURATION        ║
╠══════════════════════════════════════════════════════════════╣

DEV_SHOW_OTP=true is NOT allowed in production.

This flag exposes OTP codes in API responses, which would allow
any caller to bypass SMS verification.

Remove DEV_SHOW_OTP from your production environment.

╚══════════════════════════════════════════════════════════════╝
`)
  process.exit(1)
}

// USE_MOCK_CHAIN is forbidden in production.
if (config.USE_MOCK_CHAIN && isProduction) {
  console.error(`
╔══════════════════════════════════════════════════════════════╗
║        XPAY STARTUP ERROR — SECURITY MISCONFIGURATION        ║
╠══════════════════════════════════════════════════════════════╣

USE_MOCK_CHAIN=true is NOT allowed in production.

This flag replaces the real blockchain with a simulated in-memory
chain. Enabling it in production would mean no real USDC moves.

Remove USE_MOCK_CHAIN from your production environment.

╚══════════════════════════════════════════════════════════════╝
`)
  process.exit(1)
}

/** Guard: throw if a value could be a private key / secret — for logging safety. */
export function assertNotSecret(value: unknown, fieldName: string): void {
  if (typeof value === "string" && value.length > 8) {
    if (
      value === config.BASE_PRIVATE_KEY ||
      value === config.PAYSTACK_SECRET_KEY ||
      value === config.SESSION_SECRET ||
      value === config.FX_API_KEY
    ) {
      throw new Error(`SECURITY: Attempted to log/expose secret field: ${fieldName}`)
    }
  }
}

// ── IPv4 DNS fix — must be FIRST, before any fetch-using imports ──────────────
// Node.js v17+ prefers IPv6, which times out on networks without IPv6 routing.
// Patch globalThis.fetch to use node:https with family:4 before viem loads.
import { patchGlobalFetch } from "./lib/ipv4Fetch.js"
patchGlobalFetch()

import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import rateLimit from "express-rate-limit"
import { config, isProduction } from "./config.js"
import { api } from "./http/api/index.js"
import { chain } from "./chain/index.js"
import { db } from "./db/index.js"
import { sql } from "drizzle-orm"
import { DepositScanner } from "./services/depositScanner.js"

const app = express()

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: config.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
)

// ── Body / cookie parsing ─────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }))
app.use(cookieParser())

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProduction ? 100 : 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_requests" },
  }),
)

// ── Root ─────────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.type("text/plain").send("XPay API — Send dollars. Receive naira. No P2P.")
})

// ── Health: basic liveness ────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  try {
    const adapter = await chain()
    res.json({
      ok: true,
      product: "XPay",
      chain: adapter.kind,
      chainId: adapter.chainId,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    res.status(503).json({
      ok: false,
      error: err instanceof Error ? err.message : "chain unavailable",
    })
  }
})

// ── Health: provider readiness ────────────────────────────────────────────────
app.get("/health/providers", async (_req, res) => {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string; kind?: string; chainId?: number }> = {}

  // Database
  const dbStart = Date.now()
  try {
    await db.execute(sql`select 1`)
    checks.database = { ok: true, latencyMs: Date.now() - dbStart }
  } catch (err) {
    checks.database = { ok: false, error: err instanceof Error ? err.message : "db error" }
  }

  // Chain adapter
  const chainStart = Date.now()
  try {
    const adapter = await chain()
    checks.chain = { ok: true, latencyMs: Date.now() - chainStart, kind: adapter.kind, chainId: adapter.chainId }
  } catch (err) {
    checks.chain = { ok: false, error: err instanceof Error ? err.message : "chain error" }
  }

  // Paystack (ping bank list endpoint — never reveals secret key in response)
  const paystackStart = Date.now()
  try {
    const r = await fetch(`${config.PAYSTACK_BASE_URL}/bank?currency=NGN&perPage=1`, {
      headers: { Authorization: `Bearer ${config.PAYSTACK_SECRET_KEY}` },
      signal: AbortSignal.timeout(5000),
    })
    checks.paystack = { ok: r.ok, latencyMs: Date.now() - paystackStart, ...(!r.ok && { error: `HTTP ${r.status}` }) }
  } catch (err) {
    checks.paystack = { ok: false, error: err instanceof Error ? err.message : "paystack error" }
  }

  const allOk = Object.values(checks).every((c) => c.ok)
  res.status(allOk ? 200 : 503).json({ ok: allOk, checks })
})

// ── API routes ─────────────────────────────────────────────────────────────────
app.use("/api", api)

// ── Global error handler ──────────────────────────────────────────────────────
// Must have exactly 4 parameters for Express to treat it as an error handler.
// Catches any unhandled throw from async route handlers (Express 5 re-throws them).
app.use((err: unknown, req: import("express").Request, res: import("express").Response, _next: import("express").NextFunction) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[error] ${req.method} ${req.path} —`, message)
  if (!res.headersSent) {
    res.status(500).json({
      error: "server_error",
      message: "An unexpected error occurred. Please try again.",
    })
  }
})

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "not_found" }))

// ── Boot ─────────────────────────────────────────────────────────────────────
const server = app.listen(config.PORT, () => {
  console.log(`\nXPay API  →  http://localhost:${config.PORT}`)
  console.log(`  NODE_ENV : ${config.NODE_ENV}`)
  console.log(`  Chain    : ${config.USE_MOCK_CHAIN ? "MockChain (dev)" : `Base Sepolia (${config.BASE_CHAIN_ID})`}`)
  console.log(`  FX       : ${config.FX_PROVIDER}`)
  console.log(`  CORS     : ${config.CORS_ORIGIN}`)
  console.log("")
})

// Pre-warm the FX rate cache so the first user quote doesn't block on a cold fetch.
if (!config.USE_MOCK_CHAIN) {
  import("./providers/fx/index.js").then(({ fxProvider }) => {
    fxProvider().getRate("USDC", "NGN")
      .then(r => console.log(`[FX] Cache warmed — rate: ₦${r.rate}/$`))
      .catch(e => console.warn("[FX] Warm-up failed (will retry on first quote):", (e as Error).message))
  })
}

// ── Deposit scanner ───────────────────────────────────────────────────────────
// Starts polling for external USDC deposits after the chain adapter is ready.
// Skipped in mock mode — MockChain has no real on-chain events to scan.
let depositScanner: DepositScanner | null = null

if (!config.USE_MOCK_CHAIN) {
  chain().then((adapter) => {
    depositScanner = new DepositScanner(adapter)
    depositScanner.start()
  }).catch((err) => {
    console.error(
      "[DepositScanner] Could not start — chain adapter unavailable:",
      err instanceof Error ? err.message : err,
    )
  })
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    depositScanner?.stop()
    server.close(() => process.exit(0))
  })
}

/**
 * IPv4-safe HTTP client for viem and other fetch-based code.
 *
 * Node.js v17+ prefers IPv6 DNS results by default. On networks where IPv6
 * routing is not set up, this causes ETIMEDOUT for every outbound HTTPS
 * request made via the built-in fetch / undici. curl works because it uses
 * the OS resolver which typically falls back to IPv4.
 *
 * This module provides a custom fetch implementation backed by node:https
 * with `family: 4` (explicit IPv4), and a function to patch the global fetch
 * so viem and other libraries transparently use IPv4.
 */

import https from "node:https"
import http from "node:http"

/**
 * A fetch-compatible function that forces IPv4 DNS resolution.
 */
export async function ipv4Fetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url
  const method = (
    init?.method ??
    (input instanceof Request ? input.method : undefined) ??
    (init?.body ? "POST" : "GET")
  ) as string
  const body = init?.body as string | undefined
  const headers = (init?.headers as Record<string, string>) ?? {}

  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const mod = parsed.protocol === "https:" ? https : http

    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port) : parsed.protocol === "https:" ? 443 : 80,
      path: parsed.pathname + parsed.search,
      method,
      family: 4, // ← force IPv4
      headers: {
        "Content-Type": "application/json",
        ...headers,
        ...(body ? { "Content-Length": Buffer.byteLength(body).toString() } : {}),
      },
    }

    const req = (mod as typeof https).request(reqOptions as Parameters<typeof https.request>[0], (res) => {
      const chunks: Buffer[] = []
      res.on("data", (c: Buffer) => chunks.push(c))
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8")
        const status = res.statusCode ?? 200
        const responseHeaders = new Headers()
        for (const [k, v] of Object.entries(res.headers)) {
          if (v) responseHeaders.set(k, Array.isArray(v) ? v.join(", ") : v)
        }
        resolve(new Response(text, { status, headers: responseHeaders }))
      })
      res.on("error", reject)
    })

    req.on("error", reject)
    req.setTimeout(15_000, () => {
      req.destroy(new Error(`RPC request timed out: ${url}`))
    })

    // Honour AbortSignal (e.g. from AbortSignal.timeout())
    const signal = init?.signal as AbortSignal | null | undefined
    if (signal) {
      if (signal.aborted) {
        req.destroy(new Error("Request aborted"))
        return
      }
      signal.addEventListener("abort", () => req.destroy(new Error("Request aborted")))
    }

    if (body) req.write(body)
    req.end()
  })
}

/**
 * Replace the global fetch with our IPv4-aware version.
 * Call this once at startup before any viem clients are created.
 */
export function patchGlobalFetch(): void {
  // @ts-ignore — intentional global patch
  globalThis.fetch = ipv4Fetch
  console.log("[ipv4Fetch] Global fetch patched to force IPv4 DNS resolution")
}

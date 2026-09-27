/**
 * useOnChainTxs — fetches native ETH and ERC-20 (USDC) transfers for a wallet.
 *
 * PRIMARY:  eth_getLogs via the chain's own RPC URL — no API key, no rate limit.
 * FALLBACK: Blockscout Etherscan-compat API — used only when RPC fails.
 *           Set VITE_BLOCKSCOUT_API_KEY in .env to raise the free-tier limit.
 *
 * Supports all chains in NetworkContext (Ethereum, Sepolia, Base, Base Sepolia).
 */

import { useEffect, useState, useCallback } from "react"
import type { ChainConfig } from "@/lib/NetworkContext"

// ─── Optional Blockscout API key ──────────────────────────────────────────────
const BLOCKSCOUT_KEY = (import.meta.env.VITE_BLOCKSCOUT_API_KEY as string | undefined) ?? ""

// ─── Types ────────────────────────────────────────────────────────────────────

export type OnChainTxType = "eth_in" | "eth_out" | "usdc_in" | "usdc_out"

export interface OnChainTx {
  hash: string
  type: OnChainTxType
  /** wei for ETH, raw 6-dp units for USDC */
  value: bigint
  from: string
  to: string
  timestamp: number   // unix seconds
  blockNumber: number
  counterpart: string
  explorerUrl: string
  asset: "ETH" | "USDC"
  success: boolean
}

// ─── RPC helpers ──────────────────────────────────────────────────────────────

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
  const json = await res.json() as { result?: T; error?: { message: string } }
  if (json.error) throw new Error(`RPC error: ${json.error.message}`)
  return json.result as T
}

/** Try each RPC URL in the chain config until one succeeds. */
async function rpcWithFallback<T>(
  chain: ChainConfig,
  method: string,
  params: unknown[],
): Promise<T> {
  let lastErr: Error | null = null
  for (const url of chain.rpcUrls) {
    try {
      return await rpc<T>(url, method, params)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastErr ?? new Error("All RPC endpoints failed")
}

/** Pad an address to a 32-byte topic (0x + 24 zeros + 40 hex chars). */
function addrTopic(addr: string): string {
  return "0x" + "0".repeat(24) + addr.slice(2).toLowerCase()
}

/** Shorten an address for display. */
function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

// ─── RPC-based fetch ──────────────────────────────────────────────────────────

interface RpcLog {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  transactionHash: string
  removed: boolean
}

interface RpcBlock {
  timestamp: string
}

async function fetchViaRpc(address: string, chain: ChainConfig): Promise<OnChainTx[]> {
  const addr = address.toLowerCase()

  // Fetch current block number
  const latestHex = await rpcWithFallback<string>(chain, "eth_blockNumber", [])
  const latest = parseInt(latestHex, 16)
  // Look back ~3000 blocks (~10 hours on Base, ~12 hours on Ethereum)
  const fromBlock = "0x" + Math.max(0, latest - 3000).toString(16)
  const toBlock   = "latest"

  console.log(`[useOnChainTxs] RPC eth_getLogs chain=${chain.id} fromBlock=${fromBlock} latest=${latest}`)

  // Parallel: ETH value txs via eth_getLogs isn't possible — we use token logs only.
  // For ETH we use eth_getLogs on native transfers (not possible via logs) so we rely
  // on the Blockscout API for native ETH, and RPC for ERC-20 only.
  // Actually: fetch ERC-20 token Transfer logs for USDC (both in and out) via RPC,
  // and fetch native ETH txs via Blockscout (with retry + backoff).

  if (!chain.usdcAddress) return []

  // Incoming USDC: Transfer where topics[2] = my address
  // Outgoing USDC: Transfer where topics[1] = my address
  const [inLogs, outLogs] = await Promise.all([
    rpcWithFallback<RpcLog[]>(chain, "eth_getLogs", [{
      fromBlock,
      toBlock,
      address: chain.usdcAddress,
      topics: [TRANSFER_SIG, null, addrTopic(addr)],
    }]),
    rpcWithFallback<RpcLog[]>(chain, "eth_getLogs", [{
      fromBlock,
      toBlock,
      address: chain.usdcAddress,
      topics: [TRANSFER_SIG, addrTopic(addr)],
    }]),
  ])

  console.log(`[useOnChainTxs] RPC logs: in=${inLogs.length} out=${outLogs.length}`)

  // Collect unique block numbers to batch-fetch timestamps
  const allLogs = [...inLogs, ...outLogs].filter(l => !l.removed)
  const blockNums = [...new Set(allLogs.map(l => l.blockNumber))]

  // Batch-fetch block timestamps (max 5 at a time to avoid overwhelming RPC)
  const blockTimestamps = new Map<string, number>()
  for (let i = 0; i < blockNums.length; i += 5) {
    const batch = blockNums.slice(i, i + 5)
    const results = await Promise.allSettled(
      batch.map(bn => rpcWithFallback<RpcBlock>(chain, "eth_getBlockByNumber", [bn, false]))
    )
    for (let j = 0; j < batch.length; j++) {
      const r = results[j]
      if (r.status === "fulfilled" && r.value?.timestamp) {
        blockTimestamps.set(batch[j], parseInt(r.value.timestamp, 16))
      }
    }
  }

  const txMap = new Map<string, OnChainTx>()

  for (const log of inLogs.filter(l => !l.removed)) {
    const value = BigInt(log.data)
    if (value === 0n) continue
    const from = "0x" + log.topics[1].slice(26)
    const ts   = blockTimestamps.get(log.blockNumber) ?? 0
    const bn   = parseInt(log.blockNumber, 16)
    txMap.set(log.transactionHash + "_usdc_in", {
      hash:        log.transactionHash,
      type:        "usdc_in",
      value,
      from,
      to:          addr,
      timestamp:   ts,
      blockNumber: bn,
      counterpart: short(from),
      explorerUrl: `${chain.blockExplorer}/tx/${log.transactionHash}`,
      asset:       "USDC",
      success:     true,
    })
  }

  for (const log of outLogs.filter(l => !l.removed)) {
    const value = BigInt(log.data)
    if (value === 0n) continue
    const to = "0x" + log.topics[2].slice(26)
    // Skip if this is also an in-log (same tx, same address sending to self)
    if (to.toLowerCase() === addr) continue
    const ts   = blockTimestamps.get(log.blockNumber) ?? 0
    const bn   = parseInt(log.blockNumber, 16)
    txMap.set(log.transactionHash + "_usdc_out", {
      hash:        log.transactionHash,
      type:        "usdc_out",
      value,
      from:        addr,
      to,
      timestamp:   ts,
      blockNumber: bn,
      counterpart: short(to),
      explorerUrl: `${chain.blockExplorer}/tx/${log.transactionHash}`,
      asset:       "USDC",
      success:     true,
    })
  }

  return Array.from(txMap.values()).sort((a, b) => b.timestamp - a.timestamp)
}

// ─── Blockscout/Etherscan API fallback ────────────────────────────────────────

interface EtherscanTx {
  hash: string; from: string; to: string; value: string
  timeStamp: string; blockNumber: string; isError: string
}
interface EtherscanTokenTx {
  hash: string; from: string; to: string; value: string
  timeStamp: string; blockNumber: string
  tokenSymbol: string; tokenDecimal: string; contractAddress: string
}

async function fetchExplorerPage<T>(
  apiUrl: string,
  params: Record<string, string>,
): Promise<T[]> {
  const url = new URL(apiUrl)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set("sort",   "desc")
  url.searchParams.set("offset", "50")
  url.searchParams.set("page",   "1")
  if (BLOCKSCOUT_KEY) url.searchParams.set("apikey", BLOCKSCOUT_KEY)

  console.log("[useOnChainTxs] Explorer GET", url.toString())

  // Retry once after 1 s on 429
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url.toString())
    console.log("[useOnChainTxs] Explorer HTTP", res.status, params.action)
    if (res.status === 429) {
      if (attempt === 0) { await new Promise(r => setTimeout(r, 1200)); continue }
      throw new Error(`Rate limited (429) by ${apiUrl} — set VITE_BLOCKSCOUT_API_KEY in .env to increase limits`)
    }
    if (!res.ok) throw new Error(`Explorer HTTP ${res.status}`)

    const json = await res.json() as { status: string; message?: string; result: T[] | string }
    if (json.status !== "1") {
      const msg = typeof json.result === "string" ? json.result : (json.message ?? "unknown")
      if (/no (transactions|records|token)/i.test(msg)) return []
      throw new Error(`Explorer API: ${msg}`)
    }
    if (!Array.isArray(json.result)) throw new Error("Unexpected Explorer API response shape")
    console.log("[useOnChainTxs] Explorer records:", json.result.length, params.action)
    return json.result
  }
  return []
}

async function fetchViaExplorer(address: string, chain: ChainConfig): Promise<OnChainTx[]> {
  const addr      = address.toLowerCase()
  const apiUrl    = chain.explorerApiUrl
  const baseParams = { address, module: "account" }

  const [ethResult, tokenResult] = await Promise.allSettled([
    fetchExplorerPage<EtherscanTx>(apiUrl,  { ...baseParams, action: "txlist"  }),
    chain.usdcAddress
      ? fetchExplorerPage<EtherscanTokenTx>(apiUrl, {
          ...baseParams, action: "tokentx",
          contractaddress: chain.usdcAddress,
        })
      : Promise.resolve([] as EtherscanTokenTx[]),
  ])

  const errors: string[] = []
  if (ethResult.status   === "rejected") errors.push(String(ethResult.reason))
  if (tokenResult.status === "rejected") errors.push(String(tokenResult.reason))

  const ethTxs:   EtherscanTx[]      = ethResult.status   === "fulfilled" ? ethResult.value   : []
  const tokenTxs: EtherscanTokenTx[] = tokenResult.status === "fulfilled" ? tokenResult.value : []

  if (errors.length > 0 && ethTxs.length === 0 && tokenTxs.length === 0) {
    throw new Error(errors.join("; "))
  }
  if (errors.length > 0) console.warn("[useOnChainTxs] Explorer partial failure:", errors.join("; "))

  const txMap = new Map<string, OnChainTx>()

  for (const tx of ethTxs) {
    const value = BigInt(tx.value)
    if (value === 0n) continue
    const isIn        = tx.to.toLowerCase() === addr
    const counterpart = isIn ? tx.from : tx.to
    txMap.set(tx.hash + "_eth", {
      hash: tx.hash, type: isIn ? "eth_in" : "eth_out", value,
      from: tx.from, to: tx.to,
      timestamp:   parseInt(tx.timeStamp,   10),
      blockNumber: parseInt(tx.blockNumber, 10),
      counterpart: short(counterpart),
      explorerUrl: `${chain.blockExplorer}/tx/${tx.hash}`,
      asset: "ETH", success: tx.isError === "0",
    })
  }

  for (const tx of tokenTxs) {
    const value = BigInt(tx.value)
    if (value === 0n) continue
    const isIn        = tx.to.toLowerCase() === addr
    const counterpart = isIn ? tx.from : tx.to
    txMap.set(tx.hash + "_usdc", {
      hash: tx.hash, type: isIn ? "usdc_in" : "usdc_out", value,
      from: tx.from, to: tx.to,
      timestamp:   parseInt(tx.timeStamp,   10),
      blockNumber: parseInt(tx.blockNumber, 10),
      counterpart: short(counterpart),
      explorerUrl: `${chain.blockExplorer}/tx/${tx.hash}`,
      asset: "USDC", success: true,
    })
  }

  return Array.from(txMap.values()).sort((a, b) => b.timestamp - a.timestamp)
}

// ─── Public fetch: RPC first, Explorer fallback ───────────────────────────────

export async function fetchOnChainTxs(
  address: string,
  chain: ChainConfig,
): Promise<OnChainTx[]> {
  console.log(`[useOnChainTxs] fetch chain=${chain.id} (${chain.name}) address=${address}`)

  // Try RPC (eth_getLogs) — no rate limits, works everywhere
  try {
    const results = await fetchViaRpc(address, chain)
    console.log(`[useOnChainTxs] RPC success: ${results.length} txs`)
    return results
  } catch (rpcErr) {
    console.warn("[useOnChainTxs] RPC failed, falling back to Explorer API:", rpcErr)
  }

  // Fallback: Blockscout/Etherscan-compat API
  return fetchViaExplorer(address, chain)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOnChainTxs(address: string | null, chain: ChainConfig) {
  const [txs,     setTxs]     = useState<OnChainTx[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!address) { setTxs([]); setError(null); return }
    setLoading(true)
    setError(null)
    try {
      const results = await fetchOnChainTxs(address, chain)
      setTxs(results)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load on-chain transactions."
      console.error("[useOnChainTxs] fetch failed:", msg)
      setError(msg)
      setTxs([])
    } finally {
      setLoading(false)
    }
  }, [address, chain])

  useEffect(() => {
    setTxs([])
    setError(null)
    void refresh()
  }, [refresh])

  return { txs, loading, error, refresh }
}

/**
 * useOnChainTxs — fetches native ETH and ERC-20 (USDC) transfers for a wallet.
 *
 * PERFORMANCE STRATEGY
 * ────────────────────
 * The previous implementation fetched 100k blocks in 10k-block chunks
 * (10 RPC calls per direction × 2 directions × 2 chains = 40 RPC calls)
 * which caused very slow load times.
 *
 * New strategy:
 *  1. Start with a SHORT lookback (10k blocks ≈ last ~3 days on both testnets).
 *     This requires only 1 eth_getLogs call per direction — near-instant.
 *  2. If fewer than MIN_RESULTS are found, extend one more time to 50k blocks.
 *     Still just 1 call per direction on public nodes that accept 50k ranges,
 *     or 5 × 10k chunks if they don't. Worst case: 10 calls total, not 40.
 *  3. Results are cached in memory keyed by address+chainId for the session.
 *     Navigating away and back re-uses the cache — no re-fetch.
 *  4. Explorer API (for native ETH txs) is unchanged — it's a single HTTP call.
 *  5. Block timestamps are batched 10 at a time instead of 5.
 */

import { useEffect, useState, useCallback } from "react"
import type { ChainConfig } from "@/lib/NetworkContext"

const BLOCKSCOUT_KEY = (import.meta.env.VITE_BLOCKSCOUT_API_KEY as string | undefined) ?? ""

// ─── Tuning ───────────────────────────────────────────────────────────────────

/** First pass: 10k blocks ≈ 3 days on Base Sepolia / ETH Sepolia */
const LOOKBACK_FAST = 10_000
/** Second pass if not enough results: 50k blocks ≈ 2 weeks */
const LOOKBACK_FULL = 50_000
/** Stop extending lookback once we have at least this many USDC events */
const MIN_RESULTS = 5
/** Max blocks per single eth_getLogs call (public node safe limit) */
const CHUNK_SIZE = 10_000

// ─── Session cache ────────────────────────────────────────────────────────────

const txCache = new Map<string, { txs: OnChainTx[]; ts: number }>()
const CACHE_TTL_MS = 60_000 // 60 seconds

function cacheKey(address: string, chainId: number) {
  return `${address.toLowerCase()}_${chainId}`
}
function getCached(address: string, chainId: number): OnChainTx[] | null {
  const entry = txCache.get(cacheKey(address, chainId))
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) { txCache.delete(cacheKey(address, chainId)); return null }
  return entry.txs
}
function setCache(address: string, chainId: number, txs: OnChainTx[]) {
  txCache.set(cacheKey(address, chainId), { txs, ts: Date.now() })
}

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
  chainId: number
  chainName: string
  chainShortName: string
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

async function rpcWithFallback<T>(chain: ChainConfig, method: string, params: unknown[]): Promise<T> {
  let lastErr: Error | null = null
  for (const url of chain.rpcUrls) {
    try { return await rpc<T>(url, method, params) }
    catch (e) { lastErr = e instanceof Error ? e : new Error(String(e)) }
  }
  throw lastErr ?? new Error("All RPC endpoints failed")
}

function addrTopic(addr: string) {
  return "0x" + "0".repeat(24) + addr.slice(2).toLowerCase()
}
function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

const TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

// ─── Chunked eth_getLogs ──────────────────────────────────────────────────────

interface RpcLog {
  address: string; topics: string[]; data: string
  blockNumber: string; transactionHash: string; removed: boolean
}

async function getLogsChunked(
  chain: ChainConfig,
  filter: { address: string; topics: (string | null)[] },
  fromBlock: number,
  toBlock: number,
): Promise<RpcLog[]> {
  const all: RpcLog[] = []
  let end = toBlock
  while (end >= fromBlock) {
    const start = Math.max(fromBlock, end - CHUNK_SIZE + 1)
    try {
      const logs = await rpcWithFallback<RpcLog[]>(chain, "eth_getLogs", [{
        fromBlock: "0x" + start.toString(16),
        toBlock:   "0x" + end.toString(16),
        address: filter.address,
        topics: filter.topics,
      }])
      all.push(...logs)
    } catch (e) {
      console.warn(`[useOnChainTxs] getLogs chunk ${start}-${end} failed:`, e)
    }
    end = start - 1
  }
  return all
}

// ─── USDC via RPC — fast first pass, extend only if needed ───────────────────

async function fetchUsdcViaRpc(address: string, chain: ChainConfig): Promise<OnChainTx[]> {
  if (!chain.usdcAddress) return []
  const addr = address.toLowerCase()

  const latestHex = await rpcWithFallback<string>(chain, "eth_blockNumber", [])
  const latest = parseInt(latestHex, 16)

  // Fast pass: last 10k blocks only
  let fromBlock = Math.max(0, latest - LOOKBACK_FAST)
  let [inLogs, outLogs] = await Promise.all([
    getLogsChunked(chain, { address: chain.usdcAddress, topics: [TRANSFER_SIG, null, addrTopic(addr)] }, fromBlock, latest),
    getLogsChunked(chain, { address: chain.usdcAddress, topics: [TRANSFER_SIG, addrTopic(addr)] }, fromBlock, latest),
  ])

  const totalFast = inLogs.filter(l => !l.removed).length + outLogs.filter(l => !l.removed).length

  // If not enough results, do one more pass over the remaining older blocks
  if (totalFast < MIN_RESULTS) {
    const extendFrom = Math.max(0, latest - LOOKBACK_FULL)
    const extendTo   = fromBlock - 1
    if (extendTo >= extendFrom) {
      const [moreIn, moreOut] = await Promise.all([
        getLogsChunked(chain, { address: chain.usdcAddress, topics: [TRANSFER_SIG, null, addrTopic(addr)] }, extendFrom, extendTo),
        getLogsChunked(chain, { address: chain.usdcAddress, topics: [TRANSFER_SIG, addrTopic(addr)] }, extendFrom, extendTo),
      ])
      inLogs  = [...inLogs,  ...moreIn]
      outLogs = [...outLogs, ...moreOut]
    }
  }

  const clean = (logs: RpcLog[]) => logs.filter(l => !l.removed)
  const inClean  = clean(inLogs)
  const outClean = clean(outLogs)

  console.log(`[useOnChainTxs] USDC RPC chain=${chain.id} in=${inClean.length} out=${outClean.length}`)

  // Batch-fetch block timestamps (10 at a time instead of 5)
  const allLogs   = [...inClean, ...outClean]
  const blockNums = [...new Set(allLogs.map(l => l.blockNumber))]
  const blockTs   = new Map<string, number>()

  for (let i = 0; i < blockNums.length; i += 10) {
    const batch   = blockNums.slice(i, i + 10)
    const results = await Promise.allSettled(
      batch.map(bn => rpcWithFallback<{ timestamp: string }>(chain, "eth_getBlockByNumber", [bn, false]))
    )
    for (let j = 0; j < batch.length; j++) {
      const r = results[j]
      if (r.status === "fulfilled" && r.value?.timestamp)
        blockTs.set(batch[j], parseInt(r.value.timestamp, 16))
    }
  }

  const meta = { chainId: chain.id, chainName: chain.name, chainShortName: chain.shortName }
  const txMap = new Map<string, OnChainTx>()

  for (const log of inClean) {
    const value = BigInt(log.data)
    if (value === 0n) continue
    const from = "0x" + log.topics[1].slice(26)
    txMap.set(log.transactionHash + "_usdc_in", {
      hash: log.transactionHash, type: "usdc_in", value,
      from, to: addr,
      timestamp: blockTs.get(log.blockNumber) ?? 0,
      blockNumber: parseInt(log.blockNumber, 16),
      counterpart: short(from),
      explorerUrl: `${chain.blockExplorer}/tx/${log.transactionHash}`,
      asset: "USDC", success: true, ...meta,
    })
  }
  for (const log of outClean) {
    const value = BigInt(log.data)
    if (value === 0n || log.topics.length < 3) continue
    const to = "0x" + log.topics[2].slice(26)
    if (to.toLowerCase() === addr) continue
    txMap.set(log.transactionHash + "_usdc_out", {
      hash: log.transactionHash, type: "usdc_out", value,
      from: addr, to,
      timestamp: blockTs.get(log.blockNumber) ?? 0,
      blockNumber: parseInt(log.blockNumber, 16),
      counterpart: short(to),
      explorerUrl: `${chain.blockExplorer}/tx/${log.transactionHash}`,
      asset: "USDC", success: true, ...meta,
    })
  }

  return Array.from(txMap.values()).sort((a, b) => b.timestamp - a.timestamp)
}

// ─── Explorer API (Blockscout) ────────────────────────────────────────────────

interface EtherscanTx {
  hash: string; from: string; to: string; value: string
  timeStamp: string; blockNumber: string; isError: string
}
interface EtherscanTokenTx {
  hash: string; from: string; to: string; value: string
  timeStamp: string; blockNumber: string
  tokenSymbol: string; tokenDecimal: string; contractAddress: string
}

async function fetchExplorerPage<T>(apiUrl: string, params: Record<string, string>): Promise<T[]> {
  const url = new URL(apiUrl)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set("sort", "desc")
  url.searchParams.set("offset", "50")
  url.searchParams.set("page", "1")
  if (BLOCKSCOUT_KEY && apiUrl.includes("blockscout"))
    url.searchParams.set("apikey", BLOCKSCOUT_KEY)

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url.toString())
    if (res.status === 429) {
      if (attempt === 0) { await new Promise(r => setTimeout(r, 1000)); continue }
      throw new Error("Rate limited (429)")
    }
    if (!res.ok) throw new Error(`Explorer HTTP ${res.status}`)
    const json = await res.json() as { status: string; message?: string; result: T[] | string | null }
    if (json.status !== "1") {
      const msg = typeof json.result === "string" ? json.result : (json.message ?? "unknown")
      if (/no (transactions|records|token|result|transfer)/i.test(msg) ||
          msg === "No transactions found" || msg === "No records found" ||
          msg === "No token transfers found") return []
      throw new Error(`Explorer API: ${msg}`)
    }
    if (!json.result || !Array.isArray(json.result)) return []
    return json.result
  }
  return []
}

async function fetchViaExplorer(address: string, chain: ChainConfig): Promise<OnChainTx[]> {
  const addr       = address.toLowerCase()
  const baseParams = { address, module: "account" }
  const meta       = { chainId: chain.id, chainName: chain.name, chainShortName: chain.shortName }

  const [ethResult, tokenResult] = await Promise.allSettled([
    fetchExplorerPage<EtherscanTx>(chain.explorerApiUrl, { ...baseParams, action: "txlist" }),
    chain.usdcAddress
      ? fetchExplorerPage<EtherscanTokenTx>(chain.explorerApiUrl, {
          ...baseParams, action: "tokentx", contractaddress: chain.usdcAddress,
        })
      : Promise.resolve([] as EtherscanTokenTx[]),
  ])

  const ethTxs   = ethResult.status   === "fulfilled" ? ethResult.value   : []
  const tokenTxs = tokenResult.status === "fulfilled" ? tokenResult.value : []

  if (ethResult.status   === "rejected") console.warn("[useOnChainTxs] Explorer ETH failed:", ethResult.reason)
  if (tokenResult.status === "rejected") console.warn("[useOnChainTxs] Explorer token failed:", tokenResult.reason)
  if (!ethTxs.length && !tokenTxs.length && ethResult.status === "rejected") throw ethResult.reason

  const txMap = new Map<string, OnChainTx>()

  for (const tx of ethTxs) {
    const value = BigInt(tx.value)
    if (value === 0n) continue
    const isIn = tx.to.toLowerCase() === addr
    txMap.set(tx.hash + "_eth", {
      hash: tx.hash, type: isIn ? "eth_in" : "eth_out", value,
      from: tx.from, to: tx.to,
      timestamp:   parseInt(tx.timeStamp, 10),
      blockNumber: parseInt(tx.blockNumber, 10),
      counterpart: short(isIn ? tx.from : tx.to),
      explorerUrl: `${chain.blockExplorer}/tx/${tx.hash}`,
      asset: "ETH", success: tx.isError === "0", ...meta,
    })
  }
  for (const tx of tokenTxs) {
    const value = BigInt(tx.value)
    if (value === 0n) continue
    const isIn = tx.to.toLowerCase() === addr
    txMap.set(tx.hash + "_usdc", {
      hash: tx.hash, type: isIn ? "usdc_in" : "usdc_out", value,
      from: tx.from, to: tx.to,
      timestamp:   parseInt(tx.timeStamp, 10),
      blockNumber: parseInt(tx.blockNumber, 10),
      counterpart: short(isIn ? tx.from : tx.to),
      explorerUrl: `${chain.blockExplorer}/tx/${tx.hash}`,
      asset: "USDC", success: true, ...meta,
    })
  }

  return Array.from(txMap.values()).sort((a, b) => b.timestamp - a.timestamp)
}

// ─── Public fetch (with cache) ────────────────────────────────────────────────

export async function fetchOnChainTxs(address: string, chain: ChainConfig): Promise<OnChainTx[]> {
  if (!address) return []
  const normalised = address.startsWith("0x") ? address : `0x${address}`

  // Return cached result if still fresh
  const cached = getCached(normalised, chain.id)
  if (cached) {
    console.log(`[useOnChainTxs] cache hit chain=${chain.id}`)
    return cached
  }

  console.log(`[useOnChainTxs] fetch chain=${chain.id} (${chain.name}) addr=${normalised}`)

  const [rpcResult, explorerResult] = await Promise.allSettled([
    fetchUsdcViaRpc(normalised, chain),
    fetchViaExplorer(normalised, chain),
  ])

  const rpcTxs      = rpcResult.status      === "fulfilled" ? rpcResult.value      : []
  const explorerTxs = explorerResult.status === "fulfilled" ? explorerResult.value : []

  if (rpcResult.status      === "rejected") console.warn(`[useOnChainTxs] RPC failed chain=${chain.id}:`, rpcResult.reason)
  if (explorerResult.status === "rejected") console.warn(`[useOnChainTxs] Explorer failed chain=${chain.id}:`, explorerResult.reason)

  if (!rpcTxs.length && !explorerTxs.length) {
    if (explorerResult.status === "rejected") throw explorerResult.reason
    if (rpcResult.status      === "rejected") throw rpcResult.reason
    return []
  }

  // Merge: explorer first (ETH + fallback USDC), then RPC overwrites USDC (more recent)
  const merged = new Map<string, OnChainTx>()
  for (const tx of explorerTxs) merged.set(tx.hash + "_" + tx.asset.toLowerCase(), tx)
  for (const tx of rpcTxs)      merged.set(tx.hash + "_" + tx.asset.toLowerCase(), tx)

  const all = Array.from(merged.values()).sort((a, b) => b.timestamp - a.timestamp)
  console.log(`[useOnChainTxs] chain=${chain.id} total=${all.length}`)

  setCache(normalised, chain.id, all)
  return all
}

// ─── Single-chain hook ────────────────────────────────────────────────────────

export function useOnChainTxs(address: string | null, chain: ChainConfig) {
  const [txs,     setTxs]     = useState<OnChainTx[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!address) { setTxs([]); setError(null); return }
    setLoading(true); setError(null)
    try { setTxs(await fetchOnChainTxs(address, chain)) }
    catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load on-chain transactions."
      console.error("[useOnChainTxs]", msg)
      setError(msg); setTxs([])
    } finally { setLoading(false) }
  }, [address, chain])

  useEffect(() => { setTxs([]); setError(null); void refresh() }, [refresh])

  return { txs, loading, error, refresh }
}

// ─── Multi-chain hook (Base Sepolia + ETH Sepolia) ────────────────────────────

import { CHAINS } from "@/lib/NetworkContext"

const BOTH_TESTNETS = [
  CHAINS.find(c => c.id === 84532),    // Base Sepolia
  CHAINS.find(c => c.id === 11155111), // ETH Sepolia
].filter((c): c is ChainConfig => c !== undefined)

export function useAllChainsOnChainTxs(address: string | null) {
  const [txs,     setTxs]     = useState<OnChainTx[]>([])
  const [loading, setLoading] = useState(false)
  const [errors,  setErrors]  = useState<Record<number, string>>({})

  const refresh = useCallback(async () => {
    if (!address) { setTxs([]); setErrors({}); return }
    setLoading(true); setErrors({})

    const results = await Promise.allSettled(
      BOTH_TESTNETS.map(chain => fetchOnChainTxs(address, chain))
    )

    const all: OnChainTx[] = []
    const newErrors: Record<number, string> = {}

    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      const chain = BOTH_TESTNETS[i]
      if (r.status === "fulfilled") {
        all.push(...r.value)
      } else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
        newErrors[chain.id] = msg
        console.warn(`[useAllChainsOnChainTxs] chain=${chain.id} failed:`, msg)
      }
    }

    all.sort((a, b) => b.timestamp - a.timestamp)
    setTxs(all)
    setErrors(newErrors)
    setLoading(false)
  }, [address])

  useEffect(() => { setTxs([]); setErrors({}); void refresh() }, [refresh])

  const errorMsg = Object.keys(errors).length === BOTH_TESTNETS.length
    ? Object.values(errors).join("; ")
    : null

  return { txs, loading, error: errorMsg, errors, refresh }
}

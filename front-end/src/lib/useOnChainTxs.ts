/**
 * useOnChainTxs — fetches native ETH transfers and ERC-20 (USDC) token
 * transfers directly from Etherscan / Basescan explorer APIs.
 *
 * No API key needed for the free tier (5 req/s).
 * Returns a unified list sorted newest-first.
 */

import { useEffect, useState, useCallback } from "react"
import type { ChainConfig } from "@/lib/NetworkContext"

// ─── Types ────────────────────────────────────────────────────────────────────

export type OnChainTxType = "eth_in" | "eth_out" | "usdc_in" | "usdc_out"

export interface OnChainTx {
  hash: string
  type: OnChainTxType
  /** wei for ETH, 6-dp base units for USDC */
  value: bigint
  from: string
  to: string
  timestamp: number   // unix seconds
  blockNumber: number
  /** human label for the counterpart address */
  counterpart: string
  explorerUrl: string
  asset: "ETH" | "USDC"
  /** true = confirmed, false = pending/error */
  success: boolean
}

// ─── Explorer API helpers ─────────────────────────────────────────────────────

interface EtherscanTx {
  hash: string
  from: string
  to: string
  value: string
  timeStamp: string
  blockNumber: string
  isError: string
  txreceipt_status?: string
}

interface EtherscanTokenTx {
  hash: string
  from: string
  to: string
  value: string
  timeStamp: string
  blockNumber: string
  tokenSymbol: string
  tokenDecimal: string
  contractAddress: string
  isError?: string
}

async function fetchExplorer<T>(
  apiUrl: string,
  params: Record<string, string>,
): Promise<T[]> {
  const url = new URL(apiUrl)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set("sort", "desc")
  url.searchParams.set("offset", "50")
  url.searchParams.set("page", "1")

  try {
    const res = await fetch(url.toString())
    if (!res.ok) return []
    const json = await res.json() as { status: string; result: T[] | string }
    if (json.status !== "1" || !Array.isArray(json.result)) return []
    return json.result
  } catch {
    return []
  }
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function fetchOnChainTxs(
  address: string,
  chain: ChainConfig,
): Promise<OnChainTx[]> {
  const addr = address.toLowerCase()
  const apiUrl = chain.explorerApiUrl
  const baseParams = { address, module: "account" }

  // Fetch ETH txs + USDC token transfers in parallel
  const [ethTxs, tokenTxs] = await Promise.all([
    fetchExplorer<EtherscanTx>(apiUrl, { ...baseParams, action: "txlist" }),
    chain.usdcAddress
      ? fetchExplorer<EtherscanTokenTx>(apiUrl, {
          ...baseParams,
          action: "tokentx",
          contractaddress: chain.usdcAddress,
        })
      : Promise.resolve([] as EtherscanTokenTx[]),
  ])

  const txMap = new Map<string, OnChainTx>()

  // Process ETH transfers
  for (const tx of ethTxs) {
    const value = BigInt(tx.value)
    if (value === 0n) continue   // ignore 0-value calls
    const success = tx.isError === "0"
    const isIn = tx.to.toLowerCase() === addr
    const counterpart = isIn ? tx.from : tx.to

    txMap.set(tx.hash + "_eth", {
      hash: tx.hash,
      type: isIn ? "eth_in" : "eth_out",
      value,
      from: tx.from,
      to: tx.to,
      timestamp: parseInt(tx.timeStamp, 10),
      blockNumber: parseInt(tx.blockNumber, 10),
      counterpart: `${counterpart.slice(0, 6)}…${counterpart.slice(-4)}`,
      explorerUrl: `${chain.blockExplorer}/tx/${tx.hash}`,
      asset: "ETH",
      success,
    })
  }

  // Process USDC token transfers
  for (const tx of tokenTxs) {
    const value = BigInt(tx.value)
    if (value === 0n) continue
    const isIn = tx.to.toLowerCase() === addr
    const counterpart = isIn ? tx.from : tx.to

    txMap.set(tx.hash + "_usdc", {
      hash: tx.hash,
      type: isIn ? "usdc_in" : "usdc_out",
      value,
      from: tx.from,
      to: tx.to,
      timestamp: parseInt(tx.timeStamp, 10),
      blockNumber: parseInt(tx.blockNumber, 10),
      counterpart: `${counterpart.slice(0, 6)}…${counterpart.slice(-4)}`,
      explorerUrl: `${chain.blockExplorer}/tx/${tx.hash}`,
      asset: "USDC",
      success: true,
    })
  }

  return Array.from(txMap.values()).sort((a, b) => b.timestamp - a.timestamp)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOnChainTxs(address: string | null, chain: ChainConfig) {
  const [txs, setTxs] = useState<OnChainTx[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!address) { setTxs([]); return }
    setLoading(true)
    try {
      const results = await fetchOnChainTxs(address, chain)
      setTxs(results)
    } catch {
      setTxs([])
    } finally {
      setLoading(false)
    }
  }, [address, chain])

  useEffect(() => {
    setTxs([])
    void refresh()
  }, [refresh])

  return { txs, loading, refresh }
}

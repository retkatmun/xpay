/**
 * useWalletBalances — fetches both native ETH and USDC balances for the
 * active chain via public RPC. No backend required.
 *
 * ETH:  eth_getBalance  (native coin, 18 decimals)
 * USDC: eth_call → balanceOf  (ERC-20, 6 decimals)
 */

import { useEffect, useState, useCallback } from "react"
import { useWallets } from "@privy-io/react-auth"
import type { ChainConfig } from "@/lib/NetworkContext"

const BALANCE_OF_SELECTOR = "0x70a08231" // keccak256("balanceOf(address)")[0..4]

// ─── low-level RPC helper ─────────────────────────────────────────────────────

async function rpcCall(
  rpcUrls: string[],
  method: string,
  params: unknown[],
  label: string,
): Promise<string> {
  const errors: string[] = []
  for (const rpc of rpcUrls) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      })
      if (!res.ok) { errors.push(`${rpc} → HTTP ${res.status}`); continue }
      const json = await res.json() as { result?: string; error?: { message?: string } }
      if (json.error) {
        errors.push(`${rpc} → ${json.error.message ?? JSON.stringify(json.error)}`)
        continue
      }
      if (json.result !== undefined) return json.result
    } catch (e) {
      errors.push(`${rpc} → ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  console.error(`[useWalletBalances] All RPCs failed (${label}):`, errors)
  throw new Error(`All RPC endpoints failed for ${label}`)
}

// ─── ETH balance (wei → bigint) ───────────────────────────────────────────────

export async function fetchEthBalance(
  address: string,
  chain: ChainConfig,
): Promise<bigint> {
  const hex = await rpcCall(
    chain.rpcUrls,
    "eth_getBalance",
    [address, "latest"],
    `ETH on ${chain.name}`,
  )
  return hex && hex !== "0x" ? BigInt(hex) : 0n
}

// ─── USDC balance (6-dp bigint) ───────────────────────────────────────────────

export async function fetchUsdcBalance(
  address: string,
  chain: ChainConfig,
): Promise<bigint> {
  if (!chain.usdcAddress) return 0n
  const padded = address.toLowerCase().replace("0x", "").padStart(64, "0")
  const data = BALANCE_OF_SELECTOR + padded
  const hex = await rpcCall(
    chain.rpcUrls,
    "eth_call",
    [{ to: chain.usdcAddress, data }, "latest"],
    `USDC on ${chain.name}`,
  )
  return hex && hex !== "0x" ? BigInt(hex) : 0n
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export interface WalletBalances {
  /** USDC balance in 6-dp base units (or null while loading / error) */
  usdc: bigint | null
  /** Native ETH balance in wei (18 decimals) */
  eth: bigint | null
  loading: boolean
  error: boolean
  refresh: () => Promise<void>
}

export function useWalletBalances(chain: ChainConfig): WalletBalances {
  const { wallets } = useWallets()
  const embeddedWallet = wallets.find(w => w.walletClientType === "privy")
  const address = embeddedWallet?.address ?? null

  const [usdc, setUsdc] = useState<bigint | null>(null)
  const [eth, setEth] = useState<bigint | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const refresh = useCallback(async () => {
    if (!address) { setUsdc(null); setEth(null); return }
    setLoading(true)
    setError(false)
    try {
      const [usdcBal, ethBal] = await Promise.allSettled([
        fetchUsdcBalance(address, chain),
        fetchEthBalance(address, chain),
      ])
      setUsdc(usdcBal.status === "fulfilled" ? usdcBal.value : null)
      setEth(ethBal.status === "fulfilled" ? ethBal.value : null)
      if (usdcBal.status === "rejected" && ethBal.status === "rejected") setError(true)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [address, chain])

  useEffect(() => {
    // Clear stale balances immediately on chain switch
    setUsdc(null)
    setEth(null)
    void refresh()
    const id = setInterval(() => void refresh(), 30_000)
    return () => clearInterval(id)
  }, [refresh])

  return { usdc, eth, loading, error, refresh }
}

// ─── backwards-compat shim (used by send.tsx) ────────────────────────────────

export function useUsdcBalance(chain: ChainConfig) {
  const { usdc, loading, error, refresh } = useWalletBalances(chain)
  return { balance: usdc, loading, error, refresh }
}

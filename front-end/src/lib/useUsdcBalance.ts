/**
 * useUsdcBalance — reads USDC balance directly from Base mainnet via a public
 * RPC, no backend required.
 *
 * USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 * Uses eth_call with the ERC-20 balanceOf(address) selector.
 */

import { useEffect, useState, useCallback } from "react"
import { useWallets } from "@privy-io/react-auth"

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
const BALANCE_OF_SELECTOR = "0x70a08231" // keccak256("balanceOf(address)")[0..4]

// Public Base mainnet RPC endpoints — tried in order
const RPC_URLS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base-rpc.publicnode.com",
]

async function fetchUsdcBalance(address: string): Promise<bigint> {
  // ABI-encode: selector + address padded to 32 bytes
  const padded = address.toLowerCase().replace("0x", "").padStart(64, "0")
  const data = BALANCE_OF_SELECTOR + padded

  for (const rpc of RPC_URLS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: USDC_ADDRESS, data }, "latest"],
        }),
      })
      if (!res.ok) continue
      const json = await res.json() as { result?: string; error?: unknown }
      if (json.result && json.result !== "0x") {
        return BigInt(json.result)
      }
      if (json.result === "0x") return 0n
    } catch {
      // try next RPC
    }
  }
  throw new Error("All RPC endpoints failed")
}

export function useUsdcBalance() {
  const { wallets } = useWallets()
  const embeddedWallet = wallets.find(w => w.walletClientType === "privy")
  const address = embeddedWallet?.address ?? null

  const [balance, setBalance] = useState<bigint | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const refresh = useCallback(async () => {
    if (!address) { setBalance(null); return }
    setLoading(true)
    setError(false)
    try {
      const b = await fetchUsdcBalance(address)
      setBalance(b)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    void refresh()
    // Refresh every 30 seconds
    const id = setInterval(() => void refresh(), 30_000)
    return () => clearInterval(id)
  }, [refresh])

  return { balance, loading, error, refresh }
}

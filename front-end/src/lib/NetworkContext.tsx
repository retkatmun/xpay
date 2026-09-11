/**
 * NetworkContext — tracks the active chain across the whole app.
 * Switching network updates balance, transactions, and the navbar badge.
 * Active chain is persisted to localStorage so it survives page refreshes.
 */

import { createContext, useContext, useState, useMemo } from "react"

export type ChainConfig = {
  id: number
  name: string
  shortName: string
  color: string
  rpcUrls: string[]
  usdcAddress: string | null
  isTestnet: boolean
  blockExplorer: string
  explorerApiUrl: string
}

export const CHAINS: ChainConfig[] = [
  {
    id: 1,
    name: "Ethereum",
    shortName: "ETH",
    color: "#627EEA",
    rpcUrls: [
      "https://eth.llamarpc.com",
      "https://cloudflare-eth.com",
      "https://ethereum-rpc.publicnode.com",
    ],
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    isTestnet: false,
    blockExplorer: "https://etherscan.io",
    explorerApiUrl: "https://api.etherscan.io/api",
  },
  {
    id: 11155111,
    name: "Sepolia",
    shortName: "SEP",
    color: "#9B59B6",
    rpcUrls: [
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://sepolia.gateway.tenderly.co",
      "https://rpc.sepolia.org",
      "https://rpc2.sepolia.org",
    ],
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    isTestnet: true,
    blockExplorer: "https://sepolia.etherscan.io",
    explorerApiUrl: "https://api-sepolia.etherscan.io/api",
  },
  {
    id: 8453,
    name: "Base",
    shortName: "BASE",
    color: "#0052FF",
    rpcUrls: [
      "https://mainnet.base.org",
      "https://base.llamarpc.com",
      "https://base-rpc.publicnode.com",
    ],
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    isTestnet: false,
    blockExplorer: "https://basescan.org",
    explorerApiUrl: "https://api.basescan.org/api",
  },
  {
    id: 84532,
    name: "Base Sepolia",
    shortName: "BASE SEP",
    color: "#0052FF",
    rpcUrls: [
      "https://sepolia.base.org",
      "https://base-sepolia-rpc.publicnode.com",
    ],
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    isTestnet: true,
    blockExplorer: "https://sepolia.basescan.org",
    explorerApiUrl: "https://api-sepolia.basescan.org/api",
  },
]

export const DEFAULT_CHAIN = CHAINS.find(c => c.id === 8453)! // Base

const LS_KEY = "xpay_active_chain_id"

function readPersistedChain(): ChainConfig {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const id = parseInt(raw, 10)
      const found = CHAINS.find(c => c.id === id)
      if (found) return found
    }
  } catch {
    // localStorage unavailable (SSR, private mode, etc.)
  }
  return DEFAULT_CHAIN
}

type NetworkContextValue = {
  activeChain: ChainConfig
  setActiveChain: (chain: ChainConfig) => void
  chains: ChainConfig[]
}

const NetworkContext = createContext<NetworkContextValue | null>(null)

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [activeChain, setActiveChainState] = useState<ChainConfig>(readPersistedChain)

  const setActiveChain = (chain: ChainConfig) => {
    try { localStorage.setItem(LS_KEY, String(chain.id)) } catch { /* ignore */ }
    setActiveChainState(chain)
  }

  const value = useMemo(
    () => ({ activeChain, setActiveChain, chains: CHAINS }),
    [activeChain],
  )

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  )
}

export function useNetwork() {
  const ctx = useContext(NetworkContext)
  if (!ctx) throw new Error("useNetwork must be used inside NetworkProvider")
  return ctx
}

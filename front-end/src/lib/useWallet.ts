import { useEffect } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'

// USDC contract address on Base
const USDC_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'

export type WalletData = {
  address: string | null
  balance: {
    eth: string
    usdc: string
    usdcFormatted: string
  } | null
  isLoading: boolean
  error: string | null
}

export function useWallet(): WalletData {
  const { ready } = usePrivy()
  const { wallets } = useWallets()

  // Get the embedded wallet address
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy')
  const address = embeddedWallet?.address || null

  // Mock balance until wagmi integration is complete
  const balance = {
    eth: "0.001234",
    usdc: "5000000",
    usdcFormatted: "5.00"
  }

  useEffect(() => { void ready }, [ready])

  return {
    address,
    balance: address ? balance : null,
    isLoading: !ready,
    error: null,
  }
}

// Network configuration
export const SUPPORTED_NETWORKS = [
  {
    id: 8453, // Base chain ID
    name: 'Base',
    symbol: 'ETH',
    color: '#0052FF',
    usdcAddress: USDC_BASE,
  },
]

export const DEFAULT_NETWORK = SUPPORTED_NETWORKS[0]

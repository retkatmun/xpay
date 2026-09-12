import { mainnet, sepolia, base, baseSepolia } from 'viem/chains'

export const SUPPORTED_CHAINS = [mainnet, sepolia, base, baseSepolia]

export const privyConfig = {
  appId: import.meta.env.VITE_PRIVY_APP_ID || '',
  config: {
    appearance: {
      theme: 'light',
      accentColor: '#2563eb',
      logo: '/xpay_logo.png',
      showWalletLoginFirst: false,
    },
    loginMethods: ['email', 'google'],
    embeddedWallets: {
      createOnLogin: 'users-without-wallets',
      requireUserPasswordOnCreate: false,
    },
    defaultChain: base,
    supportedChains: SUPPORTED_CHAINS,
    fundingMethodConfig: {
      moonpay: {
        useSandbox: false,
      },
    },
  },
}

// Public RPC transports for each supported chain
export const chainTransports: Record<number, string> = {
  [mainnet.id]:    'https://eth.llamarpc.com',
  [sepolia.id]:    'https://rpc.sepolia.org',
  [base.id]:       'https://mainnet.base.org',
  [baseSepolia.id]:'https://sepolia.base.org',
}

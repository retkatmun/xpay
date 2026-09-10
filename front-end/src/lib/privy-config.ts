import { base } from 'viem/chains'

export const privyConfig = {
  appId: import.meta.env.VITE_PRIVY_APP_ID || '',
  config: {
    // Appearance
    appearance: {
      theme: 'light',
      accentColor: '#2563eb',
      logo: 'https://your-domain.com/logo.png', // Update with your logo
      showWalletLoginFirst: false,
    },
    // Login methods
    loginMethods: ['email', 'google', 'wallet'],
    // Embedded wallets
    embeddedWallets: {
      createOnLogin: 'users-without-wallets',
      requireUserPasswordOnCreate: false,
    },
    // Default chain
    defaultChain: base,
    supportedChains: [base],
    // Wallet configuration
    fundingMethodConfig: {
      moonpay: {
        useSandbox: true, // Set to false in production
      },
    },
  },
}

export const wagmiConfig = {
  chains: [base],
  transports: {
    [base.id]: 'https://mainnet.base.org',
  },
}

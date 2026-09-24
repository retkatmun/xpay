import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { mainnet, sepolia, base, baseSepolia } from 'viem/chains'
import './index.css'
import App from './App'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID as string

if (!privyAppId) {
  console.error('VITE_PRIVY_APP_ID is not set')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {privyAppId ? (
        <PrivyProvider
          appId={privyAppId}
          config={{
            appearance: {
              theme: 'dark',
              accentColor: '#10b981',
              logo: '/xpay_logo.png',
            },
            loginMethods: ['email', 'google'],
            embeddedWallets: {
              createOnLogin: 'users-without-wallets',
            },
            fundingMethodConfig: {
              moonpay: { useSandbox: false },
            },
            // All supported networks
            defaultChain: base,
            supportedChains: [mainnet, sepolia, base, baseSepolia],
          }}
        >
          <App />
        </PrivyProvider>
      ) : (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh', 
          fontFamily: 'system-ui' 
        }}>
          <div>
            <h2>Configuration Error</h2>
            <p>Missing VITE_PRIVY_APP_ID environment variable</p>
            <p>Please check your .env file</p>
          </div>
        </div>
      )}
    </ErrorBoundary>
  </StrictMode>,
)

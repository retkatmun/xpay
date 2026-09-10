import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import { ErrorBoundary } from '@/components/ErrorBoundary'
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
              theme: 'light',
              accentColor: '#2563eb',
            },
            loginMethods: ['email', 'google'],
            embeddedWallets: {
              // 'off' avoids wallet provisioning on login, which was the main
              // source of auth slowness. Wallets are created on demand later.
              createOnLogin: 'off',
            },
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

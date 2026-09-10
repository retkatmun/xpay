import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import './index.css'
import App from './App'

const privyAppId = (import.meta.env.VITE_PRIVY_APP_ID as string) || 'placeholder-app-id'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: 'light',
          accentColor: '#2563eb',
          showWalletLoginFirst: false,
        },
        loginMethods: ['email', 'google'],
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
      }}
    >
      <App />
    </PrivyProvider>
  </StrictMode>,
)

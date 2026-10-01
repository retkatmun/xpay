import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { SessionProvider, useSession } from '@/lib/session'
import { NetworkProvider } from '@/lib/NetworkContext'

// Pages
import Landing from '@/pages/landing'
import Login from '@/pages/login'
import Onboarding from '@/pages/onboarding'
import Home from '@/pages/home'
import Send from '@/pages/send'
import Receive from '@/pages/receive'
import Convert from '@/pages/convert'
import Swap from '@/pages/swap'
import Activity from '@/pages/activity'
import ActivityDetail from '@/pages/activity-detail'
import Wallet from '@/pages/wallet'
import Admin from '@/pages/admin'
import Dashboard from '@/pages/dashboard'
import Settings from '@/pages/settings'
import KycSetup from '@/pages/kyc'
import BmoniWalletSetup from '@/pages/bmoni-setup'

/**
 * Enforces the persistent onboarding gate.
 *
 * onboarding_stage values and their required screens:
 *   profile      → /home  (XPay profile done; NGN setup is optional, user-initiated)
 *   bmoni_user   → /bmoni-setup  (NGN setup started but wallet not provisioned yet)
 *   bmoni_wallet → /kyc          (wallet ready, need BVN + start-nigeria)
 *   bmoni_kyc    → /kyc          (start-nigeria called but VBA still pending)
 *   complete     → free to navigate
 *   null/missing → treat as 'profile' (legacy or new profile)
 *
 * Key difference from the old gate:
 *   - 'profile' stage → user CAN access /home and all protected routes.
 *     The NGN setup is a voluntary action triggered from the home banner.
 *   - 'bmoni_user' / 'bmoni_wallet' / 'bmoni_kyc' → user started NGN setup and
 *     must finish it; they are redirected back to the appropriate setup screen.
 *
 * Unauthenticated users are sent to /login.
 * Loading state shows nothing (avoids flash of wrong route).
 */
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { authUser, profile, loading } = useSession()
  const location = useLocation()

  if (loading) return <div className="min-h-dvh bg-[#111113]" />

  // Not logged in → send to login (unless already on public pages)
  const publicPaths = ['/', '/login', '/onboarding']
  if (!authUser && !publicPaths.includes(location.pathname)) {
    return <Navigate to="/login" replace />
  }

  // Logged in but no profile → must complete onboarding
  if (authUser && !profile && !publicPaths.includes(location.pathname)) {
    return <Navigate to="/onboarding" replace />
  }

  if (authUser && profile) {
    const stage = profile.onboarding_stage ?? 'profile'

    // If they're on a public/onboarding page but already have any profile, send home
    if (publicPaths.includes(location.pathname)) {
      return <Navigate to="/home" replace />
    }

    // If NGN setup is actively in progress (user already started it), enforce completion.
    // 'profile' stage = NGN not started yet → user is free to navigate normally.
    const allowedDuringNgnSetup = ['/bmoni-setup', '/kyc', '/home']

    if (stage === 'bmoni_user') {
      // Wallet provisioning in progress — must finish bmoni-setup
      if (!allowedDuringNgnSetup.includes(location.pathname)) {
        return <Navigate to="/bmoni-setup" replace />
      }
    }

    if (stage === 'bmoni_wallet' || stage === 'bmoni_kyc') {
      // KYC in progress — must finish kyc screen
      if (!allowedDuringNgnSetup.includes(location.pathname)) {
        return <Navigate to="/kyc" replace />
      }
    }
  }

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <NetworkProvider>
          <OnboardingGate>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/onboarding" element={<Onboarding />} />

              {/* Onboarding steps — accessible during setup */}
              <Route path="/bmoni-setup" element={<BmoniWalletSetup />} />
              <Route path="/kyc" element={<KycSetup />} />

              {/* Protected — only reachable when onboarding_stage = 'complete' */}
              <Route path="/home" element={<Home />} />
              <Route path="/wallet" element={<Wallet />} />
              <Route path="/send" element={<Send />} />
              <Route path="/receive" element={<Receive />} />
              <Route path="/convert" element={<Convert />} />
              <Route path="/swap" element={<Swap />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/activity/:id" element={<ActivityDetail />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin" element={<Admin />} />
            </Routes>
          </OnboardingGate>
        </NetworkProvider>
      </SessionProvider>
    </BrowserRouter>
  )
}

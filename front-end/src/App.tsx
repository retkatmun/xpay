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
 *   profile      → /bmoni-setup   (BMONI user not yet created)
 *   bmoni_user   → /bmoni-setup   (BMONI user created, wallet not yet provisioned)
 *   bmoni_wallet → /kyc           (wallet ready, need BVN + start-nigeria)
 *   bmoni_kyc    → /kyc           (start-nigeria called but VBA still pending)
 *   complete     → free to navigate
 *   null/missing → treat as 'profile' (legacy or new profile)
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

    // If they're on a public page but already have a complete profile, send home
    if (publicPaths.includes(location.pathname) && stage === 'complete') {
      return <Navigate to="/home" replace />
    }

    // Enforce incomplete stages — no matter what page they try to access
    const allowedDuringSetup = ['/bmoni-setup', '/kyc', '/login', '/', '/onboarding']

    if (stage === 'profile' || stage === 'bmoni_user') {
      if (!allowedDuringSetup.includes(location.pathname)) {
        return <Navigate to="/bmoni-setup" replace />
      }
    }

    if (stage === 'bmoni_wallet' || stage === 'bmoni_kyc') {
      if (!allowedDuringSetup.includes(location.pathname)) {
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

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
 * Enforces the BMONI lifecycle gate — exactly matching the 6-stage flow:
 *   Stage 1: User     → created during onboarding (POST /v1/users)
 *   Stage 2: Wallet   → /bmoni-setup  (owner-proof + create-managed)
 *   Stage 3: KYC      → /kyc          (PATCH /kyc with personalInfo + address + BVN)
 *   Stage 4: Rail     → /kyc          (POST /onboarding/start-nigeria → VBA issued)
 *   Stage 5: Fund     → /home         (user deposits via VBA)
 *   Stage 6: Move     → /send /convert (offramp, transfers)
 *
 * onboarding_stage values:
 *   'profile'      → XPay profile created, BMONI user not yet created → go to bmoni-setup
 *   'bmoni_user'   → BMONI user created, wallet not yet provisioned → go to bmoni-setup
 *   'bmoni_wallet' → wallet ready, KYC+rail not done → go to kyc
 *   'bmoni_kyc'    → start-nigeria called, VBA still pending → go to kyc
 *   'complete'     → all 6 stages done → free to navigate
 *
 * Every new user MUST complete all stages before accessing home.
 * There is no "skip" or "do it later" option.
 */
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { authUser, profile, loading } = useSession()
  const location = useLocation()

  if (loading) return <div className="min-h-dvh bg-[#111113]" />

  const publicPaths = ['/', '/login', '/onboarding']
  const setupPaths  = ['/bmoni-setup', '/kyc']

  // Not logged in → send to login
  if (!authUser && !publicPaths.includes(location.pathname)) {
    return <Navigate to="/login" replace />
  }

  // Logged in but no XPay profile → must complete onboarding
  if (authUser && !profile && !publicPaths.includes(location.pathname)) {
    return <Navigate to="/onboarding" replace />
  }

  if (authUser && profile) {
    const stage = profile.onboarding_stage ?? 'profile'

    // Already set up → don't show public/onboarding pages again
    if (publicPaths.includes(location.pathname)) {
      return <Navigate to="/home" replace />
    }

    // Stage 2: need wallet provisioning
    if (stage === 'profile' || stage === 'bmoni_user') {
      if (!setupPaths.includes(location.pathname)) {
        return <Navigate to="/bmoni-setup" replace />
      }
    }

    // Stage 3+4: need KYC + rail activation
    if (stage === 'bmoni_wallet' || stage === 'bmoni_kyc') {
      if (!setupPaths.includes(location.pathname)) {
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

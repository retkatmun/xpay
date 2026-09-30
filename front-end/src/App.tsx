import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SessionProvider } from '@/lib/session'
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

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <NetworkProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/home" element={<Home />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/send" element={<Send />} />
            <Route path="/receive" element={<Receive />} />
            <Route path="/convert" element={<Convert />} />
            <Route path="/swap" element={<Swap />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/activity/:id" element={<ActivityDetail />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </NetworkProvider>
      </SessionProvider>
    </BrowserRouter>
  )
}

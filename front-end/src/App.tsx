import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SessionProvider } from '@/lib/session'

// Pages
import Landing from '@/pages/landing'
import Login from '@/pages/login'
import Onboarding from '@/pages/onboarding'
import Home from '@/pages/home'
import Send from '@/pages/send'
import Receive from '@/pages/receive'
import Activity from '@/pages/activity'
import ActivityDetail from '@/pages/activity-detail'
import Wallet from '@/pages/wallet'

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/home" element={<Home />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/send" element={<Send />} />
          <Route path="/receive" element={<Receive />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/activity/:id" element={<ActivityDetail />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}

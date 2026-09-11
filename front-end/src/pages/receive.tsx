import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFundWallet } from '@privy-io/react-auth'
import { useSession } from '@/lib/session'
import { useWallet } from '@/lib/useWallet-simple'
import { Screen } from '@/components/Screen'
import { Title } from '@/components/Screen'
import { CopyButton } from '@/components/CopyButton'
import { getTokenLogo, getNetworkLogo } from '@/assets/logos'

export default function Receive() {
  const navigate = useNavigate()
  const { authUser, profile, loading, walletAddress: sessionWallet } = useSession()
  const { address, isLoading: walletLoading } = useWallet()
  const { fundWallet } = useFundWallet()
  const [fundLoading, setFundLoading] = useState(false)
  const [fundSuccess, setFundSuccess] = useState(false)

  useEffect(() => {
    if (!loading && !authUser) navigate('/', { replace: true })
    if (!loading && authUser && !profile) navigate('/onboarding', { replace: true })
  }, [loading, authUser, profile, navigate])

  if (!profile) return <div className="min-h-dvh bg-white" />

  const handle = `@${profile.username}`
  const walletAddress = address || sessionWallet || profile.wallet_address

  const handleFund = async () => {
    if (!walletAddress) return
    setFundLoading(true)
    setFundSuccess(false)
    try {
      await fundWallet(walletAddress, { chain: { id: 8453 }, amount: '50' })
      setFundSuccess(true)
      setTimeout(() => setFundSuccess(false), 3000)
    } catch {
      // user cancelled
    } finally {
      setFundLoading(false)
    }
  }

  return (
    <Screen back onBack={() => navigate('/home')}>
      <div className="flex flex-1 flex-col pt-4 pb-10 space-y-4">
        <Title sub="Share your handle or phone. Anyone on XPay can pay you instantly.">
          Receive money
        </Title>

        {/* ── XPay handle ── */}
        <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">XPay handle</p>
            <p className="mt-1 text-2xl font-bold leading-none tracking-tight text-gray-900">
              {handle}
            </p>
          </div>
          <CopyButton value={handle} label="Copy handle" />
        </div>

        {/* ── Phone number ── */}
        <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Phone number</p>
            <p className="mt-1 text-lg font-medium tabular-nums text-gray-900">{profile.phone}</p>
          </div>
          <CopyButton value={profile.phone} label="Copy phone" />
        </div>

        {/* ── USDC deposit address — always visible ── */}
        <div>
          <p className="mb-3 text-[0.68rem] font-bold uppercase tracking-widest text-gray-400">
            Receive USDC from outside XPay
          </p>
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {/* Network + address row */}
            <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3.5">
              <img src={getNetworkLogo('base')} alt="Base" className="h-8 w-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">Base network</p>
                <p className="text-xs text-gray-400">USDC only · ERC-20</p>
              </div>
              <img src={getTokenLogo('USDC')} alt="USDC" className="h-6 w-6 shrink-0 rounded-full" />
            </div>

            {/* Address */}
            <div className="px-4 py-3.5">
              {walletLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  <span className="text-sm text-gray-400">Loading address…</span>
                </div>
              ) : walletAddress ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="break-all font-mono text-xs leading-relaxed text-gray-700">
                    {walletAddress}
                  </p>
                  <CopyButton value={walletAddress} label="Copy" />
                </div>
              ) : (
                <p className="text-sm text-gray-400">No wallet address found.</p>
              )}
            </div>

            {/* Warning */}
            <div className="border-t border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-xs leading-relaxed text-amber-700">
                <strong>Base network only.</strong> Only send USDC on Base to this address. Sending any other token or network will result in permanent loss.
              </p>
            </div>
          </div>
        </div>

        {/* ── Fund with card ── */}
        <div>
          <p className="mb-3 text-[0.68rem] font-bold uppercase tracking-widest text-gray-400">Add funds</p>
          <button
            onClick={handleFund}
            disabled={fundLoading || !walletAddress}
            className="flex w-full items-center gap-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-left shadow-sm transition hover:bg-emerald-100 active:scale-[.98] disabled:opacity-60"
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm transition ${fundSuccess ? 'bg-green-500 shadow-green-200' : 'bg-emerald-500 shadow-emerald-200'}`}>
              {fundLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : fundSuccess ? (
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10l4.5 4.5L16 6"/>
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 4v12M4 10h12"/>
                </svg>
              )}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-900">
                {fundSuccess ? 'Funds received!' : 'Fund with card'}
              </p>
              <p className="mt-0.5 text-xs text-emerald-600">
                {fundSuccess ? 'Balance is updating…' : 'Apple Pay, Google Pay, debit or credit card'}
              </p>
            </div>
            <img src={getTokenLogo('USDC')} alt="USDC" className="h-6 w-6 shrink-0 rounded-full" />
          </button>
        </div>
      </div>
    </Screen>
  )
}

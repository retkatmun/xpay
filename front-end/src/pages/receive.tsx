import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/lib/session'
import { useWallet } from '@/lib/useWallet-simple'
import { Screen } from '@/components/Screen'
import { Title } from '@/components/Screen'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { ChevronDown } from '@/components/icons'

export default function Receive() {
  const navigate = useNavigate()
  const { authUser, profile, loading, signOut } = useSession()
  const { address, isLoading: walletLoading } = useWallet()
  const [showAddress, setShowAddress] = useState(false)

  useEffect(() => {
    if (!loading && !authUser) navigate('/', { replace: true })
    if (!loading && authUser && !profile) navigate('/onboarding', { replace: true })
  }, [loading, authUser, profile, navigate])

  if (!profile) return <div className="min-h-dvh bg-white" />

  const handle = `@${profile.username}`
  const walletAddress = address || profile.wallet_address

  return (
    <Screen back onBack={() => navigate('/home')}>
      <div className="flex flex-1 flex-col pt-4 pb-10">
        <Title sub="Share your handle or phone. Anyone on XPay can pay you instantly.">
          Receive money
        </Title>

        <div className="mt-6 space-y-3">
          {/* Handle */}
          <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">XPay handle</p>
              <p className="mt-1 font-[var(--font-instrument-serif)] text-2xl leading-none tracking-[-0.01em] text-gray-900">
                {handle}
              </p>
            </div>
            <CopyButton value={handle} label="Copy handle" />
          </div>

          {/* Phone */}
          <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Phone number</p>
              <p className="mt-1 text-lg font-medium tabular-nums text-gray-900">{profile.phone}</p>
            </div>
            <CopyButton value={profile.phone} label="Copy phone" />
          </div>
        </div>

        {/* USDC deposit address toggle */}
        {(walletAddress || walletLoading) && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowAddress(v => !v)}
              aria-expanded={showAddress}
              className="flex w-full items-center justify-between rounded-xl px-1 py-2.5 text-left transition hover:opacity-70"
            >
              <span className="text-sm text-gray-500">Receive USDC from outside XPay</span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-150 ${showAddress ? 'rotate-180' : ''}`} />
            </button>

            {showAddress && (
              <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-5">
                <p className="text-xs font-semibold text-gray-700">Your USDC deposit address</p>
                {walletLoading ? (
                  <div className="mt-3 flex items-center">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    <span className="ml-2 text-sm text-gray-500">Loading wallet address...</span>
                  </div>
                ) : walletAddress ? (
                  <>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="break-all font-mono text-xs leading-relaxed text-gray-800">
                        {walletAddress}
                      </p>
                      <CopyButton value={walletAddress} label="Copy address" />
                    </div>
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs leading-relaxed text-amber-700">
                        <strong>Only send USDC on the Base network to this address.</strong> Sending any other asset or on a different network will result in permanent loss.
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">Unable to load wallet address</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-auto pt-10">
          <Button full variant="ghost" onClick={async () => { await signOut(); navigate('/', { replace: true }) }}>
            Sign out
          </Button>
        </div>
      </div>
    </Screen>
  )
}

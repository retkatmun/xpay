import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '@/components/Screen'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { useSession } from '@/lib/session'

export default function Wallet() {
  const navigate = useNavigate()
  const { authUser, profile, loading, signOut, isAdmin } = useSession()

  useEffect(() => {
    if (!loading && !authUser) navigate('/login', { replace: true })
    if (!loading && authUser && !profile) navigate('/onboarding', { replace: true })
  }, [loading, authUser, profile, navigate])

  const handleLogout = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  if (loading || !authUser || !profile) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  const displayName = profile.display_name || profile.username
  const displayEmail = authUser.email ?? null
  const avatarLetter = displayName.charAt(0).toUpperCase()
  const googlePicture: string | null = null // wallet_address stores picture separately if needed

  return (
    <Screen back onBack={() => navigate('/home')}>
      <div className="flex flex-1 flex-col pt-4 pb-10">

        {/* ── Profile ── */}
        <div className="mb-6 text-center">
          <div className="mb-4 flex justify-center">
            {googlePicture ? (
              <img
                src={googlePicture}
                alt={displayName}
                className="h-20 w-20 rounded-full border-2 border-blue-100 shadow-lg object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-blue-100 bg-blue-50 shadow-lg">
                <span className="text-2xl font-semibold text-blue-600">{avatarLetter}</span>
              </div>
            )}
          </div>

          <h1 className="font-[var(--font-instrument-serif)] text-2xl tracking-[-0.02em] text-gray-900">
            {displayName}
          </h1>
          {displayEmail && (
            <p className="mt-1 text-sm text-gray-500">{displayEmail}</p>
          )}

          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-xs font-medium text-green-700">
              {googlePicture ? 'Google Account' : 'Email Account'}
            </span>
          </div>
        </div>

        {/* ── Account info ── */}
        <div className="mb-6 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">XPay handle</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium text-gray-900">@{profile.username}</span>
              <CopyButton value={`@${profile.username}`} label="Copy handle" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Phone</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{profile.phone}</span>
              <CopyButton value={profile.phone} label="Copy phone" />
            </div>
          </div>

          {profile.wallet_address && (
            <div className="flex items-start justify-between gap-4">
              <span className="shrink-0 text-sm text-gray-500">Wallet</span>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-xs text-gray-700 truncate">
                  {profile.wallet_address.slice(0, 8)}…{profile.wallet_address.slice(-6)}
                </span>
                <CopyButton value={profile.wallet_address} label="Copy address" />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Network</span>
            <span className="text-sm font-medium text-gray-900">Base · USDC</span>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="mb-6 space-y-3">
          <Button full variant="primary" onClick={() => navigate('/send')}>
            Send USDC
          </Button>
          <Button full variant="secondary" onClick={() => navigate('/receive')}>
            Receive USDC
          </Button>
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="flex w-full items-center gap-3 rounded-xl border border-purple-100 bg-purple-50 px-4 py-3.5 text-left shadow-sm transition hover:bg-purple-100 active:scale-[.98]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-600">
                <svg viewBox="0 0 18 18" width="15" height="15" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 1l2 5h5l-4 3 1.5 5L9 11l-4.5 3L6 9 2 6h5z"/>
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-purple-900">Admin Panel</p>
                <p className="text-xs text-purple-500">Manage users &amp; roles</p>
              </div>
              <svg className="ml-auto" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#9333ea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4l4 4-4 4" />
              </svg>
            </button>
          )}
        </div>

        <Button full variant="ghost" onClick={() => navigate('/activity')}>
          View Transaction History
        </Button>

        <div className="mt-auto pt-8">
          <Button full variant="ghost" onClick={handleLogout}>
            Sign Out
          </Button>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Secured by Supabase · Embedded wallets on Base
        </p>
      </div>
    </Screen>
  )
}

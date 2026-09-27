import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/lib/session'
import { useWallet } from '@/lib/useWallet-simple'
import { useNetwork } from '@/lib/NetworkContext'
import { Screen, Title } from '@/components/Screen'
import { CopyButton } from '@/components/CopyButton'

export default function Receive() {
  const navigate = useNavigate()
  const { authUser, profile, loading, walletAddress: sessionWallet } = useSession()
  const { address, isLoading: walletLoading } = useWallet()
  const { activeChain } = useNetwork()

  useEffect(() => {
    if (!loading && !authUser) navigate('/', { replace: true })
    if (!loading && authUser && !profile) navigate('/onboarding', { replace: true })
  }, [loading, authUser, profile, navigate])

  if (!profile) return <div className="min-h-dvh bg-[#111113]" />

  const walletAddress = address || sessionWallet || profile.wallet_address

  return (
    <Screen back onBack={() => navigate(-1)}>
      <div className="flex flex-1 flex-col pt-4 pb-10">
        <Title sub="Share your handle or phone number. Anyone on XPay can pay you instantly.">
          Receive money
        </Title>

        <div className="mt-6 space-y-0 divide-y divide-white/[0.06]">

          {/* ── XPay handle ── */}
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">
                XPay handle
              </p>
              <p className="mt-1 text-[22px] font-semibold leading-none tracking-tight text-white/85">
                {profile.username}.xpay
              </p>
            </div>
            <CopyButton value={`${profile.username}.xpay`} label="Copy" />
          </div>

          {/* ── Phone address ── */}
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">
                Phone address
              </p>
              <p className="mt-1 text-[22px] font-semibold tabular-nums leading-none tracking-tight text-white/85">
                {profile.account_number ?? profile.phone.replace(/^\+\d{1,4}/, '')}
              </p>
            </div>
            <CopyButton
              value={profile.account_number ?? profile.phone.replace(/^\+\d{1,4}/, '')}
              label="Copy"
            />
          </div>

          {/* ── External wallet ── */}
          <div className="py-5 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">
              Receive USDC from outside XPay
            </p>

            {/* Network label */}
            <div>
              <p className="text-[15px] font-medium text-white/80">{activeChain.name}</p>
              <p className="mt-0.5 text-[12px] text-white/35">
                {activeChain.usdcAddress ? 'USDC · ERC-20' : `${activeChain.nativeSymbol} only`}
                {activeChain.isTestnet ? ' · Testnet' : ''}
              </p>
            </div>

            {/* Wallet address */}
            {walletLoading ? (
              <p className="text-[13px] text-white/35">Loading address…</p>
            ) : walletAddress ? (
              <div className="flex items-start justify-between gap-3">
                <p className="break-all font-mono text-[12px] leading-relaxed text-white/50">
                  {walletAddress}
                </p>
                <div className="shrink-0 pt-0.5">
                  <CopyButton value={walletAddress} label="Copy" />
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-white/35">No wallet address found.</p>
            )}

            {/* Warning */}
            <div
              className="warning-amber rounded-xl border px-4 py-3"
              style={{
                backgroundColor: '#fffbeb',
                borderColor: '#fcd34d',
              }}
            >
              <p className="text-[13px] leading-relaxed" style={{ color: '#3d2f00' }}>
                <strong>{activeChain.name} network only.</strong>{' '}
                Only send{activeChain.usdcAddress ? ' USDC' : ` ${activeChain.nativeSymbol}`} on{' '}
                {activeChain.name} to this address. Sending any other token or network will result
                in permanent loss.
              </p>
            </div>
          </div>

        </div>
      </div>
    </Screen>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/lib/session'
import { useWallet } from '@/lib/useWallet-simple'
import { useNetwork } from '@/lib/NetworkContext'
import { Screen, Title } from '@/components/Screen'
import { CopyButton } from '@/components/CopyButton'
import { getNgnDepositAccount, type BmoniVba } from '@/lib/bmoni'

export default function Receive() {
  const navigate = useNavigate()
  const { authUser, profile, loading, walletAddress: sessionWallet } = useSession()
  const { address, isLoading: walletLoading } = useWallet()
  const { activeChain } = useNetwork()

  const [vba, setVba] = useState<BmoniVba | null>(null)
  const [vbaLoading, setVbaLoading] = useState(false)

  useEffect(() => {
    if (!loading && !authUser) navigate('/', { replace: true })
    if (!loading && authUser && !profile) navigate('/onboarding', { replace: true })
  }, [loading, authUser, profile, navigate])

  // Load NGN virtual bank account
  useEffect(() => {
    const userId = profile?.bmoni_user_id
    if (!userId) return
    // Use cached value from profile first
    if (profile?.bmoni_ngn_vba) {
      setVba({
        id: '',
        accountNumber: profile.bmoni_ngn_vba,
        bankName: 'Providus Bank',
        accountName: profile.display_name ?? profile.username,
        currency: 'NGN',
      })
      return
    }
    setVbaLoading(true)
    getNgnDepositAccount(userId)
      .then(v => setVba(v))
      .catch(() => {})
      .finally(() => setVbaLoading(false))
  }, [profile?.bmoni_user_id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return <div className="min-h-dvh bg-[#111113]" />

  const walletAddress = address || sessionWallet || profile.wallet_address
  const hasNgnSetup = !!profile.bmoni_user_id

  return (
    <Screen back onBack={() => navigate(-1)} title="Receive">
      <div className="flex flex-1 flex-col pt-4 pb-10">
        <Title sub="Choose how you want to receive money.">
          Receive money
        </Title>

        <div className="mt-6 space-y-4">

          {/* ── NGN Bank Account ── */}
          <div className="overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/50 to-[#111113]">
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-[15px] font-bold text-emerald-400">
                ₦
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white/85">Nigerian Bank Transfer</p>
                <p className="text-[11px] text-white/40">Receive NGN from any Nigerian bank</p>
              </div>
            </div>

            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              {!hasNgnSetup ? (
                <div className="px-4 py-5 text-center">
                  <p className="text-[13px] text-white/40">Complete wallet setup to get your NGN account number.</p>
                  <button
                    onClick={() => navigate('/bmoni-setup')}
                    className="mt-2 text-[13px] font-semibold text-emerald-400 underline underline-offset-2"
                  >
                    Set up now →
                  </button>
                </div>
              ) : vbaLoading ? (
                <div className="px-4 py-5 text-center">
                  <p className="text-[13px] text-white/35">Loading account details…</p>
                </div>
              ) : vba ? (
                <>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-0.5">Bank</p>
                      <p className="text-[14px] font-semibold text-white/85">{vba.bankName}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-0.5">Account number</p>
                      <p className="text-[26px] font-bold tracking-[0.1em] text-white tabular-nums">{vba.accountNumber}</p>
                    </div>
                    <CopyButton value={vba.accountNumber} label="Copy" />
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-0.5">Account name</p>
                      <p className="text-[14px] font-semibold text-white/85">{vba.accountName}</p>
                    </div>
                  </div>
                  <div className="px-4 py-3 bg-emerald-950/40">
                    <p className="text-[11px] text-emerald-400/80 leading-relaxed">
                      Transfer NGN to this account from any Nigerian bank. Funds arrive in your XPay wallet.
                    </p>
                  </div>
                </>
              ) : (
                <div className="px-4 py-5 text-center">
                  <p className="text-[13px] text-white/40">NGN account not ready yet.</p>
                  <p className="mt-1 text-[11px] text-white/25">Complete KYC to activate your Nigerian bank account.</p>
                  <button
                    onClick={() => navigate('/kyc')}
                    className="mt-3 rounded-xl bg-emerald-500/15 px-4 py-2 text-[13px] font-semibold text-emerald-400 transition hover:bg-emerald-500/25"
                  >
                    Complete KYC →
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── XPay handle ── */}
          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#1a1a1c]">
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.07]">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white/85">XPay Handle</p>
                <p className="text-[11px] text-white/40">For XPay-to-XPay transfers</p>
              </div>
            </div>
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-0.5">Username</p>
                  <p className="text-[20px] font-semibold leading-none tracking-tight text-white/85">
                    {profile.username}.xpay
                  </p>
                </div>
                <CopyButton value={`${profile.username}.xpay`} label="Copy" />
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-0.5">Phone</p>
                  <p className="text-[20px] font-semibold tabular-nums leading-none tracking-tight text-white/85">
                    {profile.account_number ?? profile.phone.replace(/^\+\d{1,4}/, '')}
                  </p>
                </div>
                <CopyButton
                  value={profile.account_number ?? profile.phone.replace(/^\+\d{1,4}/, '')}
                  label="Copy"
                />
              </div>
            </div>
          </div>

          {/* ── Crypto wallet ── */}
          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#1a1a1c]">
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#627EEA]/10">
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path d="M12 2L4 12l8 5 8-5L12 2z" fill="#627EEA" opacity="0.9"/>
                  <path d="M4 12l8 10 8-10" fill="#627EEA" opacity="0.5"/>
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white/85">Crypto Wallet</p>
                <p className="text-[11px] text-white/40">
                  {activeChain.usdcAddress ? 'USDC or ETH' : activeChain.nativeSymbol} · {activeChain.name}
                  {activeChain.isTestnet ? ' (testnet)' : ''}
                </p>
              </div>
            </div>
            <div className="border-t border-white/[0.06]">
              {walletLoading ? (
                <div className="px-4 py-4">
                  <p className="text-[13px] text-white/35">Loading address…</p>
                </div>
              ) : walletAddress ? (
                <>
                  <div className="flex items-start justify-between gap-3 px-4 py-3">
                    <p className="break-all font-mono text-[12px] leading-relaxed text-white/50">
                      {walletAddress}
                    </p>
                    <div className="shrink-0 pt-0.5">
                      <CopyButton value={walletAddress} label="Copy" />
                    </div>
                  </div>
                  <div className="px-4 py-3 bg-amber-950/20 border-t border-white/[0.06]">
                    <p className="text-[11px] leading-relaxed text-amber-400/80">
                      <strong>{activeChain.name} only.</strong> Only send
                      {activeChain.usdcAddress ? ' USDC' : ` ${activeChain.nativeSymbol}`} on{' '}
                      {activeChain.name}. Wrong network = permanent loss.
                    </p>
                  </div>
                </>
              ) : (
                <div className="px-4 py-4">
                  <p className="text-[13px] text-white/35">No wallet address found.</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </Screen>
  )
}

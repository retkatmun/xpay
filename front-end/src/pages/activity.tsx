import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/lib/session'
import { Screen } from '@/components/Screen'
import { Title } from '@/components/Screen'
import { getTransactions } from '@/lib/api'
import { dayLabel } from '@/lib/time'
import { statusLabel, statusColor } from '@/lib/txStatus'
import { formatUSD } from '@/lib/money'
import { getTokenLogo } from '@/assets/logos'
import { Avatar } from '@/components/Avatar'
import { useNetwork } from '@/lib/NetworkContext'
import { NetworkSwitcher } from '@/components/NetworkSwitcher'
import { useAllChainsOnChainTxs, type OnChainTx } from '@/lib/useOnChainTxs'
import { useProfileAvatars } from '@/lib/useProfileAvatars'
import type { Transaction } from '@/lib/types'

// ─── Bottom tab icons (shared visual language with home.tsx) ──────────────────

function HomeIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none"
      stroke="rgba(255,255,255,0.4)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M7 18v-6h6v6" />
    </svg>
  )
}
function PortfolioIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none"
      stroke="rgba(255,255,255,0.4)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="16" height="12" rx="1.5" />
      <path d="M6 5V4a2 2 0 014 0v1" /><path d="M2 10h16" />
    </svg>
  )
}
function ActivityIconActive() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none"
      stroke="#10b981" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 2.5" />
    </svg>
  )
}
function SettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none"
      stroke="rgba(255,255,255,0.4)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" />
    </svg>
  )
}

// ─── XPay internal tx row ─────────────────────────────────────────────────────

function TxRow({ tx, last, avatarSrc }: { tx: Transaction; last: boolean; avatarSrc?: string | null }) {
  const navigate = useNavigate()
  const out = tx.direction === 'out'
  const usd = BigInt(tx.amount)
  const ngn = BigInt(tx.ngnAmount)
  const color = statusColor(tx.status)

  return (
    <button
      onClick={() => navigate(`/activity/${tx.id}`)}
      className={['flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[#161618]', !last ? 'border-b border-white/[0.06]' : ''].join(' ')}
    >
      <div className="relative shrink-0">
        {tx.recipientType === 'bank_account' ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
            </svg>
          </div>
        ) : (
          <Avatar name={tx.recipientDisplayName} size={40} src={avatarSrc} />
        )}
        <span className={`absolute -right-0.5 -bottom-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full text-[8px] font-bold text-white ${out ? 'bg-gray-400' : 'bg-emerald-500/100'}`}>
          {out ? '↑' : '↓'}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.875rem] font-medium text-white/90">{tx.recipientDisplayName}</p>
        <p className={`text-xs ${color}`}>{statusLabel(tx.status)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-semibold tabular-nums ${out ? 'text-white/80' : 'text-emerald-400'}`}>
          {out ? '−' : '+'}{formatUSD(usd)}
        </p>
        {ngn > 0n && <p className="text-xs text-white/40 tabular-nums">₦{ngn.toLocaleString('en-NG')}</p>}
      </div>
    </button>
  )
}

// ─── On-chain tx row (ETH / USDC from explorer) ───────────────────────────────

function OnChainTxRow({ tx, last }: { tx: OnChainTx; last: boolean }) {
  const isIn = tx.type === 'eth_in' || tx.type === 'usdc_in'

  const valueLabel = tx.asset === 'ETH'
    ? `${(Number(tx.value) / 1e18).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })} ETH`
    : formatUSD(tx.value)

  const chainColor = tx.chainId === 84532 ? 'text-blue-400/70' : 'text-purple-400/70'

  return (
    <a
      href={tx.explorerUrl}
      target="_blank"
      rel="noreferrer"
      className={['flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[#161618]', !last ? 'border-b border-white/[0.06]' : ''].join(' ')}
    >
      <div className="relative shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#161618]">
          {tx.asset === 'ETH' ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path d="M12 2L4 12l8 5 8-5L12 2z" fill="#627EEA" opacity="0.9"/>
              <path d="M4 12l8 10 8-10" fill="#627EEA" opacity="0.5"/>
            </svg>
          ) : (
            <img src={getTokenLogo('USDC')} alt="USDC" className="h-6 w-6 rounded-full" />
          )}
        </div>
        <span className={`absolute -right-0.5 -bottom-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full text-[8px] font-bold text-white ${isIn ? 'bg-emerald-500/100' : 'bg-gray-400'}`}>
          {isIn ? '↓' : '↑'}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white/90">
          {isIn ? `Received ${tx.asset}` : `Sent ${tx.asset}`}
        </p>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${chainColor}`}>{tx.chainName}</span>
          <span className="text-white/20 text-[9px]">·</span>
          <span className="text-xs text-white/40 truncate">{tx.counterpart}</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-semibold tabular-nums ${isIn ? 'text-emerald-400' : 'text-white/80'}`}>
          {isIn ? '+' : '−'}{valueLabel}
        </p>
        <p className="text-[10px] text-white/40">on-chain</p>
      </div>
    </a>
  )
}

// ─── Main activity page ───────────────────────────────────────────────────────

export default function Activity() {
  const navigate = useNavigate()
  const { authUser, profile, loading, walletAddress } = useSession()
  const { activeChain } = useNetwork()
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)

  // On-chain txs: both Base Sepolia + ETH Sepolia in parallel
  const effectiveWallet = walletAddress || profile?.wallet_address || null
  const { txs: onChainTxs, loading: onChainLoading, error: onChainError, refresh: refreshOnChain } = useAllChainsOnChainTxs(effectiveWallet)

  // Batch-fetch avatars for all XPay transaction counterparts
  const xpayUsernames = useMemo(
    () => (transactions ?? [])
      .filter(tx => tx.recipientType === 'xpay_user' && tx.recipientUsername)
      .map(tx => tx.recipientUsername!)
      .filter((u, i, arr) => arr.indexOf(u) === i), // deduplicate
    [transactions]
  )
  const avatars = useProfileAvatars(xpayUsernames)

  useEffect(() => {
    if (!loading && !authUser) navigate('/', { replace: true })
    if (!loading && authUser && !profile) navigate('/onboarding', { replace: true })
  }, [loading, authUser, profile, navigate])

  // Re-fetch XPay internal transactions whenever the user or active network changes
  useEffect(() => {
    if (!authUser?.id) return
    setTransactions(null)
    void getTransactions(authUser.id).then(setTransactions).catch(() => setTransactions([]))
  }, [authUser?.id, activeChain.id])

  // Merge XPay txs + on-chain txs, sorted newest first
  type FeedItem =
    | { kind: 'xpay'; tx: Transaction; ts: number }
    | { kind: 'onchain'; tx: OnChainTx; ts: number }

  const groups = useMemo(() => {
    const xpayItems: FeedItem[] = (transactions ?? []).map(tx => ({
      kind: 'xpay' as const,
      tx,
      ts: new Date(tx.createdAt).getTime(),
    }))
    const chainItems: FeedItem[] = onChainTxs.map(tx => ({
      kind: 'onchain' as const,
      tx,
      ts: tx.timestamp * 1000,
    }))

    const all = [...xpayItems, ...chainItems].sort((a, b) => b.ts - a.ts)

    const map = new Map<string, FeedItem[]>()
    for (const item of all) {
      const k = dayLabel(new Date(item.ts).toISOString())
      const bucket = map.get(k)
      if (bucket) bucket.push(item)
      else map.set(k, [item])
    }
    return Array.from(map, ([label, items]) => ({ label, items }))
  }, [transactions, onChainTxs])

  if (!authUser || !profile) return <div className="min-h-dvh bg-[#111113]" />

  const isLoading = transactions === null && onChainLoading

  return (
    <>
    <Screen back onBack={() => navigate('/home')} action={<NetworkSwitcher />}>
      <div className="flex-1 pt-4 pb-24">
        <Title>Transactions</Title>

        {/* Network context pill */}
        <p className="mt-1 text-xs text-white/40">
          XPay transfers + on-chain activity across{' '}
          <span className="font-semibold text-white/60">Base Sepolia</span>
          {' '}&amp;{' '}
          <span className="font-semibold text-white/60">ETH Sepolia</span>
        </p>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="mt-8 space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3 py-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-white/[0.07] animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/5 rounded-full bg-white/[0.07] animate-pulse" />
                  <div className="h-2.5 w-1/4 rounded-full bg-white/[0.07] animate-pulse" />
                </div>
                <div className="h-3 w-14 rounded-full bg-white/[0.07] animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* On-chain fetch error */}
        {onChainError && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-900/30 bg-red-950/30 px-4 py-3.5">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
              <circle cx="8" cy="8" r="6" /><path d="M8 5v3M8 10.5v.5" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-red-400 leading-relaxed">
                Could not load on-chain transactions from {activeChain.name}.
              </p>
              <p className="mt-0.5 text-[11px] text-red-400/60 leading-relaxed break-all">
                {onChainError}
              </p>
            </div>
            <button
              onClick={() => refreshOnChain()}
              className="shrink-0 rounded-lg border border-red-900/40 px-2.5 py-1 text-[12px] font-semibold text-red-400 transition hover:bg-red-900/30"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && groups.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#161618]">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-white/70">No transactions yet</p>
            <p className="text-xs text-white/40">
              Your XPay transfers and on-chain activity on {activeChain.name} will appear here.
            </p>
          </div>
        )}

        {/* Transaction groups */}
        {!isLoading && groups.map(group => (
          <section key={group.label} className="mt-8">
            <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-widest text-white/40">
              {group.label}
            </p>
            <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm">
              {group.items.map((item, i) =>
                item.kind === 'xpay' ? (
                  <TxRow key={item.tx.id} tx={item.tx} last={i === group.items.length - 1} avatarSrc={item.tx.recipientUsername ? avatars.get(item.tx.recipientUsername) : undefined} />
                ) : (
                  <OnChainTxRow key={item.tx.hash + item.tx.type} tx={item.tx} last={i === group.items.length - 1} />
                )
              )}
            </div>
          </section>
        ))}
      </div>
    </Screen>

    {/* ── Bottom tab bar — Activity highlighted, mirrors home.tsx ── */}
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-[#111113]/95 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-[480px] items-stretch">
        {[
          { label: 'Home',      route: '/home',      icon: <HomeIcon /> },
          { label: 'Portfolio', route: '/dashboard',  icon: <PortfolioIcon /> },
          { label: 'Activity',  route: '/activity',   icon: <ActivityIconActive />, active: true },
          { label: 'Settings',  route: '/settings',   icon: <SettingsIcon /> },
        ].map(({ label, route, icon, active }) => (
          <button
            key={route}
            onClick={() => navigate(route)}
            className={[
              'flex flex-1 flex-col items-center gap-1 py-2 transition active:scale-95',
              active ? 'text-emerald-400' : 'text-white/35 hover:text-white/60',
            ].join(' ')}
          >
            {icon}
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </div>
    </nav>
    </>
  )
}

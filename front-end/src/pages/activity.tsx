import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/lib/session'
import { Screen } from '@/components/Screen'
import { Title } from '@/components/Screen'
import { getTransactions } from '@/lib/api'
import { dayLabel } from '@/lib/time'
import { statusLabel, statusColor } from '@/lib/txStatus'
import { formatUSD } from '@/lib/money'
import { Avatar } from '@/components/Avatar'
import { useNetwork } from '@/lib/NetworkContext'
import { NetworkSwitcher } from '@/components/NetworkSwitcher'
import type { Transaction } from '@/lib/types'

function TxRow({ tx, last }: { tx: Transaction; last: boolean }) {
  const navigate = useNavigate()
  const out = tx.direction === 'out'
  const usd = BigInt(tx.amount)
  const ngn = BigInt(tx.ngnAmount)
  const color = statusColor(tx.status)

  return (
    <button
      onClick={() => navigate(`/activity/${tx.id}`)}
      className={['flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-gray-50', !last ? 'border-b border-gray-100' : ''].join(' ')}
    >
      <div className="relative shrink-0">
        {tx.recipientType === 'bank_account' ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
            </svg>
          </div>
        ) : (
          <Avatar name={tx.recipientDisplayName} size={40} />
        )}
        <span className={`absolute -right-0.5 -bottom-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full text-[8px] font-bold text-white ${out ? 'bg-gray-400' : 'bg-blue-500'}`}>
          {out ? '↑' : '↓'}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.875rem] font-medium text-gray-900">{tx.recipientDisplayName}</p>
        <p className={`text-xs ${color}`}>{statusLabel(tx.status)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-semibold tabular-nums ${out ? 'text-gray-800' : 'text-blue-600'}`}>
          {out ? '−' : '+'}{formatUSD(usd)}
        </p>
        {ngn > 0n && <p className="text-xs text-gray-400 tabular-nums">₦{ngn.toLocaleString('en-NG')}</p>}
      </div>
    </button>
  )
}

export default function Activity() {
  const navigate = useNavigate()
  const { authUser, profile, loading } = useSession()
  const { activeChain } = useNetwork()
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)

  useEffect(() => {
    if (!loading && !authUser) navigate('/', { replace: true })
    if (!loading && authUser && !profile) navigate('/onboarding', { replace: true })
  }, [loading, authUser, profile, navigate])

  // Re-fetch whenever the active network changes
  useEffect(() => {
    if (!profile) return
    setTransactions(null)
    void getTransactions(authUser?.id).then(setTransactions).catch(() => setTransactions([]))
  }, [profile, activeChain.id])

  const groups = useMemo(() => {
    if (!transactions) return []
    const map = new Map<string, Transaction[]>()
    for (const t of transactions) {
      const k = dayLabel(t.createdAt)
      const b = map.get(k); if (b) b.push(t); else map.set(k, [t])
    }
    return Array.from(map, ([label, items]) => ({ label, items }))
  }, [transactions])

  if (!authUser || !profile) return <div className="min-h-dvh bg-white" />

  return (
    <Screen back onBack={() => navigate('/home')} action={<NetworkSwitcher />}>
      <div className="flex-1 pt-4 pb-12">
        <Title>Transactions</Title>

        {transactions === null && (
          <div className="mt-8 space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="flex items-center gap-3 py-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-gray-100 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/5 rounded-full bg-gray-100 animate-pulse" />
                  <div className="h-2.5 w-1/4 rounded-full bg-gray-100 animate-pulse" />
                </div>
                <div className="h-3 w-14 rounded-full bg-gray-100 animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {transactions !== null && groups.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-50">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700">No transactions yet</p>
            <p className="text-xs text-gray-400">Your transfers will appear here</p>
          </div>
        )}

        {groups.map(group => (
          <section key={group.label} className="mt-8">
            <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-widest text-gray-400">{group.label}</p>
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              {group.items.map((tx, i) => <TxRow key={tx.id} tx={tx} last={i === group.items.length - 1} />)}
            </div>
          </section>
        ))}
      </div>
    </Screen>
  )
}

/**
 * XPay Admin Panel — three tabs:
 *   Overview     — KPI stats, 7-day volume chart, transaction breakdown, recent activity
 *   Users        — all profiles, expandable rows, role management, wallet/phone/account info
 *   Transactions — all transactions, filter by direction/status/search, expandable detail
 */

import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useSession, type XPayProfile } from "@/lib/session"
import {
  fetchAllProfiles,
  fetchAllTransactions,
  fetchAdminStats,
  updateUserRole,
  type SupabaseTransaction,
} from "@/lib/supabase"
import { Screen } from "@/components/Screen"
import { Spinner } from "@/components/icons"
import { Avatar } from "@/components/Avatar"
import { CHAINS } from "@/lib/NetworkContext"

// ─── Types ────────────────────────────────────────────────────────────────────

// Tab type defined in Root component as AdminTab

type AdminStats = {
  totalTx: number
  completedTx: number
  pendingTx: number
  failedTx: number
  totalVolumeUsdc: bigint
  totalVolumeNgn: bigint
  totalFeesNgn: bigint
  totalUsers: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUsdc(base: bigint): string {
  const whole = base / 1_000_000n
  const frac  = (base % 1_000_000n).toString().padStart(6, "0").slice(0, 2)
  return `$${whole.toLocaleString()}.${frac}`
}

function fmtNgn(base: bigint): string {
  return `₦${base.toLocaleString("en-NG")}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

function chainName(chainId: number | null): string {
  if (!chainId) return "—"
  return CHAINS.find(c => c.id === chainId)?.shortName ?? `#${chainId}`
}

const STATUS_COLORS: Record<string, string> = {
  completed:             "bg-green-100 text-green-700",
  payout_processing:     "bg-blue-100 text-emerald-400",
  payout_pending:        "bg-blue-100 text-emerald-400",
  conversion_processing: "bg-yellow-100 text-yellow-700",
  blockchain_confirmed:  "bg-yellow-100 text-yellow-700",
  blockchain_detected:   "bg-yellow-100 text-yellow-700",
  awaiting_payment:      "bg-white/[0.07] text-white/60",
  created:               "bg-white/[0.07] text-white/60",
  manual_review:         "bg-purple-100 text-purple-700",
  blockchain_failed:     "bg-red-100 text-red-700",
  payout_failed:         "bg-red-100 text-red-700",
  cancelled:             "bg-red-100 text-red-600",
  expired:               "bg-red-100 text-red-600",
  rejected:              "bg-red-100 text-red-700",
}

function StatusPill({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-white/[0.07] text-white/50"
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={[
      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
      role === "admin" ? "bg-purple-100 text-purple-700" : "bg-white/[0.07] text-white/60",
    ].join(" ")}>
      {role === "admin" && (
        <svg viewBox="0 0 12 12" width="9" height="9" fill="currentColor">
          <path d="M6 0l1.5 3.5L11 4 8.5 6.5 9 10l-3-1.5L3 10l.5-3.5L1 4l3.5-.5z" />
        </svg>
      )}
      {role}
    </span>
  )
}

function StatCard({
  label, value, sub, color = "gray",
}: {
  label: string; value: string | number; sub?: string
  color?: "gray"|"green"|"blue"|"red"|"purple"|"yellow"
}) {
  const bg: Record<string, string> = {
    gray: "border-white/[0.06] bg-[#1a1a1c]", green: "border-green-100 bg-green-50",
    blue: "border-blue-100 bg-emerald-500/10", red: "border-red-100 bg-red-50",
    purple: "border-purple-100 bg-purple-50", yellow: "border-yellow-100 bg-yellow-50",
  }
  const txt: Record<string, string> = {
    gray: "text-white/90", green: "text-green-700", blue: "text-emerald-400",
    red: "text-red-700", purple: "text-purple-700", yellow: "text-yellow-700",
  }
  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${bg[color]}`}>
      <p className={`text-xl font-bold tabular-nums ${txt[color]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs tabular-nums text-white/50">{sub}</p>}
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-white/40">{label}</p>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ stats, transactions, loading }: {
  stats: AdminStats | null; transactions: SupabaseTransaction[]; loading: boolean
}) {
  const dailyVolume = useMemo(() => {
    const days: Record<string, { usdc: bigint; count: number }> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      days[d.toISOString().slice(0, 10)] = { usdc: 0n, count: 0 }
    }
    for (const tx of transactions) {
      if (tx.direction !== "out") continue
      const key = tx.created_at.slice(0, 10)
      if (days[key]) { days[key].usdc += BigInt(tx.amount || "0"); days[key].count++ }
    }
    return Object.entries(days).map(([date, v]) => ({ date, ...v }))
  }, [transactions])

  const maxUsdc = dailyVolume.reduce((m, d) => d.usdc > m ? d.usdc : m, 1n)

  if (loading || !stats) return (
    <div className="flex items-center justify-center py-16"><Spinner className="h-6 w-6 text-blue-500" /></div>
  )

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Users"    value={stats.totalUsers}   color="blue" />
        <StatCard label="Transactions"   value={stats.totalTx}      />
        <StatCard label="Completed"      value={stats.completedTx}  color="green" />
        <StatCard label="Pending"        value={stats.pendingTx}    color="yellow" />
        <StatCard label="Failed"         value={stats.failedTx}     color="red" />
        <StatCard label="Manual Review"  value={transactions.filter(t => t.status === "manual_review").length} color="purple" />
      </div>

      {/* Volume */}
      <div className="space-y-3">
        <StatCard label="Total Volume Sent (USDC)" value={fmtUsdc(stats.totalVolumeUsdc)}
          sub={`≈ ${fmtNgn(stats.totalVolumeNgn)} delivered to recipients`} color="blue" />
        <StatCard label="Total Fees Collected" value={fmtNgn(stats.totalFeesNgn)} color="green" />
      </div>

      {/* 7-day bar chart */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <p className="text-sm font-semibold text-white/90">Volume — last 7 days</p>
          <p className="text-xs text-white/40">Outgoing USDC</p>
        </div>
        <div className="flex items-end gap-1.5 px-4 pb-2 pt-4" style={{ height: 110 }}>
          {dailyVolume.map(d => {
            const pct = maxUsdc > 0n ? Number((d.usdc * 100n) / maxUsdc) : 0
            const dayLabel = new Date(d.date).toLocaleDateString("en-NG", { weekday: "short" })
            return (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <p className="text-[9px] font-semibold tabular-nums text-white/40">
                  {d.count > 0 ? d.count : ""}
                </p>
                <div className="w-full rounded-t-sm bg-emerald-500/100 transition-all"
                  style={{ height: `${Math.max(pct, d.usdc > 0n ? 6 : 2)}%` }} />
                <p className="text-[9px] text-white/40">{dayLabel}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Breakdown */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <p className="text-sm font-semibold text-white/90">Send Breakdown</p>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {[
            { label: "XPay user sends",    color: "bg-emerald-500/100",   count: transactions.filter(t => t.direction==="out" && t.recipient_type==="xpay_user").length },
            { label: "Bank account sends", color: "bg-green-500",  count: transactions.filter(t => t.direction==="out" && t.recipient_type==="bank_account").length },
            { label: "Incoming deposits",  color: "bg-purple-500", count: transactions.filter(t => t.direction==="in").length },
          ].map(row => (
            <div key={row.label} className="flex items-center gap-3 px-4 py-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.color}`} />
              <p className="flex-1 text-sm text-white/70">{row.label}</p>
              <p className="text-sm font-bold tabular-nums text-white/90">{row.count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent 10 transactions */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <p className="text-sm font-semibold text-white/90">Recent Activity</p>
        </div>
        {transactions.length === 0
          ? <p className="px-4 py-8 text-center text-sm text-white/40">No transactions yet.</p>
          : transactions.slice(0, 10).map(tx => (
            <div key={tx.id} className="flex items-center gap-3 border-b border-gray-50 px-4 py-3 last:border-0">
              <div className={[
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                tx.direction === "in" ? "bg-green-50 text-green-600" : "bg-emerald-500/10 text-emerald-400",
              ].join(" ")}>
                {tx.direction === "in" ? "↓" : "↑"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white/90">{tx.recipient_display_name}</p>
                <p className="text-xs text-white/40">{fmtDateShort(tx.created_at)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums text-white/90">{fmtUsdc(BigInt(tx.amount||"0"))}</p>
                <StatusPill status={tx.status} />
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({ users, loading, currentUserId, onToggleRole, updating }: {
  users: XPayProfile[]; loading: boolean; currentUserId: string
  onToggleRole: (u: XPayProfile) => void; updating: string | null
}) {
  const [search, setSearch]     = useState("")
  const [sortKey, setSortKey]   = useState<"created_at"|"display_name"|"role"|"username">("created_at")
  const [sortDir, setSortDir]   = useState<"asc"|"desc">("desc")
  const [expanded, setExpanded] = useState<string | null>(null)

  function handleSort(k: typeof sortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(k); setSortDir("asc") }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter(u =>
      u.username.toLowerCase().includes(q) ||
      u.display_name.toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q) ||
      u.phone.includes(q) ||
      (u.account_number ?? "").includes(q)
    )
  }, [users, search])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = (a[sortKey] as string) ?? ""; const bv = (b[sortKey] as string) ?? ""
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
  }), [filtered, sortKey, sortDir])

  function Arrow({ col }: { col: typeof sortKey }) {
    if (sortKey !== col) return <span className="ml-0.5 text-[10px] text-white/30">↕</span>
    return <span className="ml-0.5 text-[10px] text-emerald-400">{sortDir === "asc" ? "↑" : "↓"}</span>
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Spinner className="h-6 w-6 text-blue-500" /></div>

  const adminCount = users.filter(u => u.role === "admin").length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Total"  value={users.length} />
        <StatCard label="Admins" value={adminCount}              color="purple" />
        <StatCard label="Users"  value={users.length-adminCount} color="blue" />
      </div>

      {/* Search */}
      <div className="flex h-11 items-center gap-2 rounded-xl border border-white/[0.08] bg-black px-3 transition focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
          <circle cx="6.5" cy="6.5" r="4" /><path d="M11 11l3 3" />
        </svg>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Name, @handle, phone, account number…"
          className="flex-1 bg-transparent text-base text-white/90 outline-none placeholder:text-white/40" />
        {search && (
          <button onClick={() => setSearch("")} className="text-white/40 hover:text-white/60">
            <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        )}
      </div>

      {/* Sort pills */}
      <div className="flex flex-wrap gap-2 text-xs">
        {(["display_name","username","role","created_at"] as const).map(col => (
          <button key={col} onClick={() => handleSort(col)}
            className={["rounded-lg border px-2.5 py-1 font-semibold transition",
              sortKey === col ? "border-blue-500 bg-emerald-500/10 text-emerald-400" : "border-white/[0.08] bg-white text-white/50 hover:border-gray-300",
            ].join(" ")}>
            {col === "display_name" ? "Name" : col === "created_at" ? "Joined" : col[0].toUpperCase()+col.slice(1)}
            <Arrow col={col} />
          </button>
        ))}
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm">
        {sorted.length === 0
          ? <p className="py-10 text-center text-sm text-white/40">{search ? "No matches." : "No users found."}</p>
          : sorted.map((user, i) => {
            const isSelf = user.id === currentUserId
            const isOpen = expanded === user.id
            return (
              <div key={user.id} className={i < sorted.length-1 ? "border-b border-gray-50" : ""}>
                <button type="button" onClick={() => setExpanded(isOpen ? null : user.id)}
                  className={["flex w-full items-center gap-3 px-4 py-3 text-left transition",
                    isSelf ? "bg-emerald-500/10/40" : "hover:bg-[#161618]"].join(" ")}>
                  <Avatar name={user.display_name} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-white/90">{user.display_name}</p>
                      {isSelf && <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-400">You</span>}
                    </div>
                    <p className="truncate text-xs text-white/40">@{user.username} · {user.phone}</p>
                  </div>
                  <RoleBadge role={user.role} />
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round"
                    className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-50 bg-[#161618]/50 px-4 py-3 space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <div>
                        <p className="font-medium text-white/40">Account #</p>
                        <p className="font-mono text-white/70">{user.account_number ?? "—"}</p>
                      </div>
                      <div>
                        <p className="font-medium text-white/40">Email</p>
                        <p className="truncate text-white/70">{user.email ?? "—"}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="font-medium text-white/40">Wallet Address</p>
                        <p className="break-all font-mono text-[11px] text-white/70">{user.wallet_address ?? "Not set"}</p>
                      </div>
                      <div>
                        <p className="font-medium text-white/40">Joined</p>
                        <p className="text-white/70">{user.created_at ? fmtDateShort(user.created_at) : "—"}</p>
                      </div>
                      <div>
                        <p className="font-medium text-white/40">Updated</p>
                        <p className="text-white/70">{user.updated_at ? fmtDateShort(user.updated_at) : "—"}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="font-medium text-white/40">User ID</p>
                        <p className="break-all font-mono text-[11px] text-white/50">{user.id}</p>
                      </div>
                    </div>
                    {!isSelf && (
                      <button onClick={() => onToggleRole(user)} disabled={updating === user.id}
                        className={["mt-1 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition",
                          user.role === "admin"
                            ? "bg-red-50 text-red-600 hover:bg-red-100"
                            : "bg-purple-50 text-purple-700 hover:bg-purple-100",
                        ].join(" ")}>
                        {updating === user.id ? <Spinner className="h-3.5 w-3.5" />
                          : user.role === "admin" ? "Revoke Admin" : "Make Admin"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
      </div>
      <p className="text-center text-xs text-white/40">{sorted.length} of {users.length} users shown</p>
    </div>
  )
}

// ─── Transactions Tab ─────────────────────────────────────────────────────────

function TransactionsTab({ transactions, users, loading }: {
  transactions: SupabaseTransaction[]; users: XPayProfile[]; loading: boolean
}) {
  const [search, setSearch]       = useState("")
  const [statusFilter, setStatus] = useState("all")
  const [dirFilter, setDir]       = useState<"all"|"in"|"out">("all")
  const [expanded, setExpanded]   = useState<string | null>(null)

  const userMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const u of users) m[u.id] = u.display_name
    return m
  }, [users])

  const allStatuses = useMemo(() => Array.from(new Set(transactions.map(t => t.status))).sort(), [transactions])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return transactions.filter(tx => {
      if (dirFilter !== "all" && tx.direction !== dirFilter) return false
      if (statusFilter !== "all" && tx.status !== statusFilter) return false
      if (q && !(
        tx.id.toLowerCase().includes(q) ||
        tx.recipient_display_name.toLowerCase().includes(q) ||
        (tx.tx_hash ?? "").toLowerCase().includes(q) ||
        (userMap[tx.user_id] ?? "").toLowerCase().includes(q)
      )) return false
      return true
    })
  }, [transactions, search, statusFilter, dirFilter, userMap])

  if (loading) return <div className="flex items-center justify-center py-16"><Spinner className="h-6 w-6 text-blue-500" /></div>

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex h-11 items-center gap-2 rounded-xl border border-white/[0.08] bg-black px-3 transition focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
          <circle cx="6.5" cy="6.5" r="4" /><path d="M11 11l3 3" />
        </svg>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Recipient, tx hash, sender name…"
          className="flex-1 bg-transparent text-base text-white/90 outline-none placeholder:text-white/40" />
        {search && (
          <button onClick={() => setSearch("")} className="text-white/40 hover:text-white/60">
            <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        )}
      </div>

      {/* Direction filter */}
      <div className="flex gap-2">
        {(["all","out","in"] as const).map(d => (
          <button key={d} onClick={() => setDir(d)}
            className={["rounded-full border px-3 py-1 text-xs font-semibold transition",
              dirFilter === d ? "border-blue-500 bg-emerald-500/100 text-white" : "border-white/[0.08] bg-white text-white/50 hover:border-gray-300",
            ].join(" ")}>
            {d === "all" ? "All" : d === "out" ? "↑ Sent" : "↓ Received"}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setStatus("all")}
          className={["rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition",
            statusFilter === "all" ? "border-gray-700 bg-gray-700 text-white" : "border-white/[0.08] bg-white text-white/50",
          ].join(" ")}>All</button>
        {allStatuses.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={["rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition",
              statusFilter === s
                ? `${STATUS_COLORS[s] ?? "bg-gray-200 text-white/70"} border-transparent`
                : "border-white/[0.08] bg-white text-white/50",
            ].join(" ")}>
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      <p className="text-xs text-white/40">{filtered.length} of {transactions.length} transactions</p>

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm">
        {filtered.length === 0
          ? <p className="py-10 text-center text-sm text-white/40">No transactions match your filters.</p>
          : filtered.map((tx, i) => {
            const isOpen      = expanded === tx.id
            const senderName  = userMap[tx.user_id] ?? "Unknown"
            const usdcAmt     = BigInt(tx.amount || "0")
            const ngnAmt      = BigInt(tx.ngn_amount || "0")
            const feeNgn      = BigInt(tx.fee_ngn || "0")

            return (
              <div key={tx.id} className={i < filtered.length-1 ? "border-b border-gray-50" : ""}>
                <button type="button" onClick={() => setExpanded(isOpen ? null : tx.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[#161618]">
                  <div className={["flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    tx.direction === "in" ? "bg-green-50 text-green-600" : "bg-emerald-500/10 text-emerald-400"].join(" ")}>
                    {tx.direction === "in" ? "↓" : "↑"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white/90">{tx.recipient_display_name}</p>
                    <p className="truncate text-xs text-white/40">
                      by <span className="font-medium text-white/60">{senderName}</span> · {fmtDateShort(tx.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0 space-y-0.5 text-right">
                    <p className="text-sm font-bold tabular-nums text-white/90">{fmtUsdc(usdcAmt)}</p>
                    <StatusPill status={tx.status} />
                  </div>
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round"
                    className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-50 bg-[#161618]/50 px-4 py-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                      <div>
                        <p className="font-medium text-white/40">USDC Amount</p>
                        <p className="font-mono font-semibold text-white/80">{fmtUsdc(usdcAmt)}</p>
                      </div>
                      <div>
                        <p className="font-medium text-white/40">NGN Amount</p>
                        <p className="font-semibold text-white/80">{ngnAmt > 0n ? fmtNgn(ngnAmt) : "—"}</p>
                      </div>
                      <div>
                        <p className="font-medium text-white/40">Fee (NGN)</p>
                        <p className="text-white/70">{feeNgn > 0n ? fmtNgn(feeNgn) : "Free"}</p>
                      </div>
                      <div>
                        <p className="font-medium text-white/40">FX Rate</p>
                        <p className="text-white/70">{tx.fx_rate > 0 ? `$1 = ₦${tx.fx_rate.toLocaleString()}` : "—"}</p>
                      </div>
                      <div>
                        <p className="font-medium text-white/40">Type</p>
                        <p className="text-white/70">{tx.recipient_type.replace("_", " ")}</p>
                      </div>
                      <div>
                        <p className="font-medium text-white/40">Network</p>
                        <p className="text-white/70">{chainName(tx.chain_id)}</p>
                      </div>
                      <div>
                        <p className="font-medium text-white/40">Direction</p>
                        <p className="text-white/70">{tx.direction === "out" ? "Outgoing" : "Incoming"}</p>
                      </div>
                      <div>
                        <p className="font-medium text-white/40">Sender</p>
                        <p className="truncate text-white/70">{senderName}</p>
                      </div>
                      {tx.recipient_bank_name && (
                        <div className="col-span-2">
                          <p className="font-medium text-white/40">Bank</p>
                          <p className="text-white/70">
                            {tx.recipient_bank_name}
                            {tx.recipient_account_number_last4 ? ` · ****${tx.recipient_account_number_last4}` : ""}
                          </p>
                        </div>
                      )}
                      {tx.memo && (
                        <div className="col-span-2">
                          <p className="font-medium text-white/40">Memo</p>
                          <p className="italic text-white/70">"{tx.memo}"</p>
                        </div>
                      )}
                      {tx.tx_hash && (
                        <div className="col-span-2">
                          <p className="font-medium text-white/40">Tx Hash</p>
                          <a href={`${CHAINS.find(c => c.id === tx.chain_id)?.blockExplorer ?? "https://basescan.org"}/tx/${tx.tx_hash}`}
                            target="_blank" rel="noreferrer"
                            className="break-all font-mono text-[11px] text-emerald-400 underline-offset-2 hover:underline">
                            {tx.tx_hash}
                          </a>
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-white/40">Created</p>
                        <p className="text-white/70">{fmtDate(tx.created_at)}</p>
                      </div>
                      <div>
                        <p className="font-medium text-white/40">Updated</p>
                        <p className="text-white/70">{fmtDate(tx.updated_at)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="font-medium text-white/40">Transaction ID</p>
                        <p className="break-all font-mono text-[11px] text-white/50">{tx.id}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        }
      </div>
    </div>
  )
}

// ─── Enrollments Tab ──────────────────────────────────────────────────────────

const ENROLL_STATUS_COLORS: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-700",
  active:    "bg-green-100 text-green-700",
  suspended: "bg-orange-100 text-orange-700",
  completed: "bg-blue-100 text-emerald-400",
  cancelled: "bg-red-100 text-red-600",
}

const PAY_STATUS_COLORS: Record<string, string> = {
  pending:  "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  refunded: "bg-purple-100 text-purple-700",
  failed:   "bg-red-100 text-red-600",
}

function EnrollmentsTab({
  enrollments, loading, adminId, onRefresh,
}: {
  enrollments: import("@/lib/supabase").Enrollment[]
  loading: boolean
  adminId: string
  onRefresh: () => void
}) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [payFilter, setPayFilter] = useState<string>("all")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [adminNote, setAdminNote] = useState("")
  const [actionError, setActionError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return enrollments.filter(e => {
      const name = e.profile?.display_name?.toLowerCase() ?? ""
      const email = e.profile?.email?.toLowerCase() ?? ""
      const course = e.course_name.toLowerCase()
      const matchQ = !q || name.includes(q) || email.includes(q) || course.includes(q)
      const matchS = statusFilter === "all" || e.status === statusFilter
      const latestPay = e.payments?.[0]
      const matchP = payFilter === "all" || latestPay?.status === payFilter || (!latestPay && payFilter === "none")
      return matchQ && matchS && matchP
    })
  }, [enrollments, search, statusFilter, payFilter])

  async function handleReview(paymentId: string, decision: "approved" | "rejected") {
    setReviewing(paymentId)
    setActionError(null)
    try {
      const { reviewEnrollmentPayment } = await import("@/lib/supabase")
      await reviewEnrollmentPayment(paymentId, adminId, decision, adminNote || undefined)
      setAdminNote("")
      onRefresh()
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Action failed.")
    } finally {
      setReviewing(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Spinner className="h-6 w-6 text-blue-500" /></div>

  const pendingPayCount = enrollments.reduce((n, e) =>
    n + (e.payments?.filter(p => p.status === "pending").length ?? 0), 0)

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Total Enrollments" value={enrollments.length} />
        <StatCard label="Pending Payments"  value={pendingPayCount}    color="yellow" />
        <StatCard label="Active"            value={enrollments.filter(e => e.status === "active").length}    color="green" />
        <StatCard label="Pending Approval"  value={enrollments.filter(e => e.status === "pending").length}   color="gray" />
      </div>

      {/* Filters */}
      <div className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-black px-3 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"><circle cx="6.5" cy="6.5" r="4"/><path d="M11 11l3 3"/></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, course…" className="flex-1 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/40"/>
      </div>
      <div className="flex flex-wrap gap-2">
        {["all","pending","active","completed","cancelled"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={["rounded-full px-3 py-1 text-xs font-semibold transition", statusFilter === s ? "bg-emerald-500 text-white" : "bg-white/[0.07] text-white/60 hover:bg-gray-200"].join(" ")}>
            {s === "all" ? "All status" : s}
          </button>
        ))}
        <span className="mx-1 text-white/30">|</span>
        {["all","pending","approved","rejected","none"].map(s => (
          <button key={s} onClick={() => setPayFilter(s)}
            className={["rounded-full px-3 py-1 text-xs font-semibold transition", payFilter === s ? "bg-purple-600 text-white" : "bg-white/[0.07] text-white/60 hover:bg-gray-200"].join(" ")}>
            {s === "all" ? "All payments" : s === "none" ? "No payment" : `Pay: ${s}`}
          </button>
        ))}
      </div>

      {actionError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>}

      {/* Enrollment list */}
      {filtered.length === 0
        ? <p className="py-12 text-center text-sm text-white/40">No enrollments found.</p>
        : filtered.map(enroll => {
          const isOpen = expanded === enroll.id
          const latestPay = enroll.payments?.[0]
          const progress = enroll.progress
          const pct = progress && progress.total_lessons > 0
            ? Math.round((progress.completed_lessons / progress.total_lessons) * 100) : 0

          return (
            <div key={enroll.id} className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm">
              <button
                onClick={() => setExpanded(isOpen ? null : enroll.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[#161618]"
              >
                {/* Avatar initial */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-bold text-emerald-400">
                  {(enroll.profile?.display_name?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white/90">{enroll.profile?.display_name ?? "—"}</p>
                  <p className="truncate text-xs text-white/40">{enroll.course_name} · {enroll.program_type}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${ENROLL_STATUS_COLORS[enroll.status] ?? "bg-white/[0.07] text-white/50"}`}>
                    {enroll.status}
                  </span>
                  {latestPay && (
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${PAY_STATUS_COLORS[latestPay.status] ?? "bg-white/[0.07] text-white/50"}`}>
                      ₦{Number(latestPay.amount).toLocaleString()} · {latestPay.status}
                    </span>
                  )}
                </div>
                <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                  <path d="M2 4l4 4 4-4"/>
                </svg>
              </button>

              {isOpen && (
                <div className="border-t border-white/[0.06] px-4 py-4 space-y-4 bg-[#161618]/50">
                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div><p className="text-white/40">Email</p><p className="font-medium text-white/70 truncate">{enroll.profile?.email ?? "—"}</p></div>
                    <div><p className="text-white/40">Phone</p><p className="font-medium text-white/70">{enroll.profile?.phone ?? "—"}</p></div>
                    <div><p className="text-white/40">Enrolled</p><p className="font-medium text-white/70">{fmtDate(enroll.enrolled_at)}</p></div>
                    <div><p className="text-white/40">Activated</p><p className="font-medium text-white/70">{enroll.activated_at ? fmtDate(enroll.activated_at) : "—"}</p></div>
                    <div className="col-span-2"><p className="text-white/40">Enrollment ID</p><p className="font-mono text-[10px] text-white/50 break-all">{enroll.id}</p></div>
                    {enroll.notes && <div className="col-span-2"><p className="text-white/40">Notes</p><p className="text-white/70">{enroll.notes}</p></div>}
                  </div>

                  {/* Progress */}
                  {progress && (
                    <div>
                      <p className="mb-1 text-xs font-semibold text-white/60">Progress — {progress.completed_lessons}/{progress.total_lessons} lessons ({pct}%)</p>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div className="h-full rounded-full bg-emerald-500/100 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      {progress.last_activity_at && (
                        <p className="mt-1 text-[10px] text-white/40">Last activity: {fmtDate(progress.last_activity_at)}</p>
                      )}
                    </div>
                  )}

                  {/* Payments */}
                  {enroll.payments && enroll.payments.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-white/60">Payment Records</p>
                      {enroll.payments.map(pay => (
                        <div key={pay.id} className="rounded-xl border border-white/[0.08] bg-black p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-white/90">₦{Number(pay.amount).toLocaleString()} {pay.currency}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PAY_STATUS_COLORS[pay.status] ?? "bg-white/[0.07]"}`}>{pay.status}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-xs text-white/50">
                            {pay.payment_method && <span>Method: {pay.payment_method}</span>}
                            {pay.payment_reference && <span>Ref: {pay.payment_reference}</span>}
                            <span>Submitted: {fmtDate(pay.created_at)}</span>
                            {pay.reviewed_at && <span>Reviewed: {fmtDate(pay.reviewed_at)}</span>}
                          </div>
                          {pay.proof_url && (
                            <a href={pay.proof_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:underline">
                              View proof ↗
                            </a>
                          )}
                          {pay.admin_note && (
                            <p className="rounded-lg bg-[#161618] px-3 py-2 text-xs text-white/60">Admin note: {pay.admin_note}</p>
                          )}

                          {/* Approve / Reject controls — only for pending */}
                          {pay.status === "pending" && (
                            <div className="space-y-2 pt-1">
                              <textarea
                                value={adminNote}
                                onChange={e => setAdminNote(e.target.value)}
                                placeholder="Optional note to attach to this decision…"
                                rows={2}
                                className="w-full rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-white/80 outline-none resize-none focus:border-blue-400 focus:ring-1 focus:ring-emerald-100"
                              />
                              <div className="flex gap-2">
                                <button
                                  disabled={reviewing === pay.id}
                                  onClick={() => handleReview(pay.id, "approved")}
                                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2.5 text-xs font-bold text-white transition hover:bg-green-700 disabled:opacity-50"
                                >
                                  {reviewing === pay.id ? <Spinner className="h-3.5 w-3.5" /> : "✓"} Approve
                                </button>
                                <button
                                  disabled={reviewing === pay.id}
                                  onClick={() => handleReview(pay.id, "rejected")}
                                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                                >
                                  {reviewing === pay.id ? <Spinner className="h-3.5 w-3.5" /> : "✕"} Reject
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {(!enroll.payments || enroll.payments.length === 0) && (
                    <p className="text-xs text-white/40 italic">No payment submitted yet.</p>
                  )}
                </div>
              )}
            </div>
          )
        })
      }
    </div>
  )
}

// ─── Notifications Panel ───────────────────────────────────────────────────────

function NotificationsPanel({
  notifications, onMarkRead, onMarkAllRead,
}: {
  notifications: import("@/lib/supabase").AdminNotification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
}) {
  const unread = notifications.filter(n => !n.is_read).length
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white/90">{unread} unread</p>
        {unread > 0 && (
          <button onClick={onMarkAllRead} className="text-xs font-semibold text-emerald-400 hover:underline">
            Mark all read
          </button>
        )}
      </div>
      {notifications.length === 0
        ? <p className="py-8 text-center text-sm text-white/40">No notifications yet.</p>
        : notifications.map(n => (
          <div key={n.id} className={["flex gap-3 rounded-xl p-3 transition", n.is_read ? "bg-[#161618]" : "bg-emerald-500/10 border border-blue-100"].join(" ")}>
            <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${n.is_read ? "bg-gray-200 text-white/50" : "bg-blue-200 text-emerald-400"}`}>
              {n.type === "new_enrollment" ? "📋" : n.type === "payment_approved" ? "✓" : n.type === "payment_rejected" ? "✕" : "🔔"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white/90">{n.title}</p>
              <p className="mt-0.5 text-xs text-white/50">{n.message}</p>
              <p className="mt-1 text-[10px] text-white/40">{fmtDate(n.created_at)}</p>
            </div>
            {!n.is_read && (
              <button onClick={() => onMarkRead(n.id)} className="shrink-0 text-xs text-white/40 hover:text-white/60">✕</button>
            )}
          </div>
        ))
      }
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

type AdminTab = "overview" | "users" | "transactions" | "enrollments" | "notifications"

export default function Admin() {
  const navigate = useNavigate()
  const { authUser, profile, loading, isAdmin } = useSession()

  const [tab, setTab]                   = useState<AdminTab>("overview")
  const [users, setUsers]               = useState<XPayProfile[]>([])
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([])
  const [enrollments, setEnrollments]   = useState<import("@/lib/supabase").Enrollment[]>([])
  const [notifications, setNotifications] = useState<import("@/lib/supabase").AdminNotification[]>([])
  const [stats, setStats]               = useState<AdminStats | null>(null)
  const [fetching, setFetching]         = useState(true)
  const [updating, setUpdating]         = useState<string | null>(null)
  const [error, setError]               = useState<string | null>(null)
  const [refreshing, setRefreshing]     = useState(false)

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return
    if (!authUser) { navigate("/login",      { replace: true }); return }
    if (!profile)  { navigate("/onboarding", { replace: true }); return }
    if (!isAdmin)  { navigate("/home",        { replace: true }); return }
  }, [loading, authUser, profile, isAdmin, navigate])

  const loadAll = async () => {
    if (!isAdmin) return
    setFetching(true); setError(null)
    try {
      const {
        fetchAllEnrollments,
        fetchAdminNotifications,
      } = await import("@/lib/supabase")

      const [p, t, s, e, n] = await Promise.all([
        fetchAllProfiles(),
        fetchAllTransactions(),
        fetchAdminStats(),
        fetchAllEnrollments(),
        fetchAdminNotifications(),
      ])
      setUsers(p as XPayProfile[])
      setTransactions(t)
      setStats(s)
      setEnrollments(e)
      setNotifications(n)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load data.")
    } finally { setFetching(false) }
  }

  useEffect(() => { void loadAll() }, [isAdmin])

  async function handleRefresh() {
    setRefreshing(true); await loadAll(); setRefreshing(false)
  }

  async function handleToggleRole(user: XPayProfile) {
    const newRole = user.role === "admin" ? "user" : "admin"
    setUpdating(user.id); setError(null)
    try {
      await updateUserRole(user.id, newRole)
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update role.")
    } finally { setUpdating(null) }
  }

  async function handleMarkRead(id: string) {
    const { markNotificationRead } = await import("@/lib/supabase")
    await markNotificationRead(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  async function handleMarkAllRead() {
    const { markAllNotificationsRead } = await import("@/lib/supabase")
    await markAllNotificationsRead()
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  if (loading || !isAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#1a1a1c]">
        <Spinner className="h-8 w-8 text-emerald-400" />
      </div>
    )
  }

  const unreadCount   = notifications.filter(n => !n.is_read).length
  const pendingPayCount = enrollments.reduce((n, e) =>
    n + (e.payments?.filter(p => p.status === "pending").length ?? 0), 0)

  const TABS: { key: AdminTab; label: string; count?: number; badge?: number }[] = [
    { key: "overview",     label: "Overview" },
    { key: "users",        label: "Users",       count: users.length },
    { key: "enrollments",  label: "Enrollments", count: enrollments.length, badge: pendingPayCount },
    { key: "transactions", label: "Txns",        count: transactions.length },
    { key: "notifications",label: "🔔",          badge: unreadCount },
  ]

  return (
    <Screen back onBack={() => navigate(-1)}>
      <div className="flex flex-1 flex-col pt-4 pb-12">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white/90">Admin Panel</h1>
            <p className="mt-0.5 text-sm text-white/40">XPay platform dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button onClick={() => setTab("notifications")}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-emerald-500/10 text-emerald-400 transition hover:bg-blue-100">
                <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                  <path d="M8 2a5 5 0 00-5 5v2l-1 2h12l-1-2V7a5 5 0 00-5-5zM6.5 13.5a1.5 1.5 0 003 0"/>
                </svg>
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              </button>
            )}
            <button onClick={handleRefresh} disabled={refreshing}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-black text-white/50 transition hover:bg-[#161618] active:scale-95">
              {refreshing
                ? <Spinner className="h-4 w-4 text-blue-500" />
                : <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13.5 2.5A7 7 0 102.5 10M2 6.5V10h3.5" />
                  </svg>
              }
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Tab bar — scrollable on small screens */}
        <div className="mt-4 overflow-x-auto">
          <div className="flex min-w-max gap-1 rounded-xl border border-white/[0.06] bg-[#161618] p-1">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={["relative flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition whitespace-nowrap",
                  tab === t.key ? "bg-white text-white/90 shadow-sm" : "text-white/50 hover:text-white/70",
                ].join(" ")}>
                {t.label}
                {t.count !== undefined && (
                  <span className={["rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                    tab === t.key ? "bg-blue-100 text-emerald-400" : "bg-gray-200 text-white/50",
                  ].join(" ")}>{t.count}</span>
                )}
                {t.badge !== undefined && t.badge > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                    {t.badge > 9 ? "9+" : t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="mt-4">
          {tab === "overview"      && <OverviewTab stats={stats} transactions={transactions} loading={fetching} />}
          {tab === "users"         && <UsersTab users={users} loading={fetching} currentUserId={authUser?.id ?? ""} onToggleRole={handleToggleRole} updating={updating} />}
          {tab === "enrollments"   && <EnrollmentsTab enrollments={enrollments} loading={fetching} adminId={authUser?.id ?? ""} onRefresh={handleRefresh} />}
          {tab === "transactions"  && <TransactionsTab transactions={transactions} users={users} loading={fetching} />}
          {tab === "notifications" && <NotificationsPanel notifications={notifications} onMarkRead={handleMarkRead} onMarkAllRead={handleMarkAllRead} />}
        </div>
      </div>
    </Screen>
  )
}

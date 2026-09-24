
import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Avatar } from "@/components/Avatar"
import { Badge } from "@/components/Badge"
import { Screen } from "@/components/Screen"
import { getTransaction } from "@/lib/api"
import { formatUSD } from "@/lib/money"
import { fullTime } from "@/lib/time"
import { statusLabel, statusColor, isTerminal } from "@/lib/txStatus"
import { useSession } from "@/lib/session"
import type { Transaction } from "@/lib/types"

export default function ActivityDetail() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { authUser, profile, loading } = useSession()
  const [tx, setTx] = useState<Transaction | null | undefined>(undefined) // undefined = loading

  useEffect(() => {
    if (!loading && !authUser) navigate("/", { replace: true })
    if (!loading && authUser && !profile) navigate("/onboarding", { replace: true })
  }, [loading, authUser, profile, navigate])

  useEffect(() => {
    if (!profile || !id) return
    void getTransaction(id).then((data) => setTx(data))
  }, [profile, id])

  // Poll while pending
  useEffect(() => {
    if (!profile || !tx || isTerminal(tx.status)) return
    const interval = setInterval(() => {
      void getTransaction(id!).then((data) => {
        if (data) setTx(data)
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [profile, tx, id])

  if (!authUser || !profile) return <div className="min-h-dvh bg-[#111113]" />

  if (tx === undefined) {
    return (
      <Screen back onBack={() => navigate(-1)}>
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      </Screen>
    )
  }

  if (tx === null) {
    return (
      <Screen back onBack={() => navigate(-1)}>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#161618]">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
            </svg>
          </div>
          <p className="text-sm font-medium text-white/70">Transaction not found</p>
          <button onClick={() => navigate(-1)} className="text-xs text-emerald-400">Go back</button>
        </div>
      </Screen>
    )
  }

  const out = tx.direction === "out"
  const usd = BigInt(tx.amount)
  const ngn = BigInt(tx.ngnAmount)
  const fee = BigInt(tx.feeNgn)
  const color = statusColor(tx.status)

  const explorerUrl = tx.txHash
    ? `https://sepolia.basescan.org/tx/${tx.txHash}`
    : null

  const steps = buildTimeline(tx)
  const badgeVariant =
    tx.status === "completed" ? "green"
    : tx.status.includes("failed") || tx.status === "expired" || tx.status === "cancelled" ? "red"
    : "blue"

  return (
    <Screen back onBack={() => navigate(-1)}>
      <div className="flex-1 pb-10">

        {/* ── Hero ── */}
        <section className="mt-2 flex flex-col items-center gap-3 pb-6 border-b border-white/[0.06]">
          <div className="relative">
            {tx.recipientType === "bank_account" ? (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                </svg>
              </div>
            ) : (
              <Avatar name={tx.recipientDisplayName} size={64} />
            )}
            <span className={`absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow ${out ? "bg-gray-400" : "bg-emerald-500/100"}`}>
              {out ? "↑" : "↓"}
            </span>
          </div>

          <div className="text-center">
            <p className="text-base font-semibold text-white/90">{tx.recipientDisplayName}</p>
            {tx.recipientType === "bank_account" && tx.recipientBankName && (
              <p className="text-xs text-white/50 mt-0.5">
                {tx.recipientBankName}
                {tx.recipientAccountNumberLast4 ? ` ••••${tx.recipientAccountNumberLast4}` : ""}
              </p>
            )}
          </div>

          <div className="text-center">
            <p className={`text-3xl font-bold tabular-nums tracking-tight ${out ? "text-white/90" : "text-emerald-400"}`}>
              {out ? "−" : "+"}{formatUSD(usd)}
            </p>
            {ngn > 0n && (
              <p className="mt-1 text-sm text-white/50 tabular-nums">
                ₦{ngn.toLocaleString("en-NG")} NGN
              </p>
            )}
          </div>

          <Badge variant={badgeVariant}>{statusLabel(tx.status)}</Badge>
        </section>

        {/* ── Details ── */}
        <section className="mt-5 rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm divide-y divide-white/[0.06] overflow-hidden">
          <DetailRow label="Date" value={fullTime(tx.createdAt)} />
          <DetailRow label="Status" value={<span className={color}>{statusLabel(tx.status)}</span>} />
          {tx.recipientType === "bank_account" && tx.recipientBankName && (
            <DetailRow label="Bank" value={tx.recipientBankName} />
          )}
          {tx.recipientAccountNumberLast4 && (
            <DetailRow label="Account" value={`••••${tx.recipientAccountNumberLast4}`} />
          )}
          <DetailRow label="Asset" value={tx.asset} />
          <DetailRow label="Amount" value={formatUSD(usd)} />
          <DetailRow label="FX Rate" value={`₦${tx.fxRate.toLocaleString("en-NG")} / USD`} />
          {fee > 0n && (
            <DetailRow label="Fee" value={`₦${fee.toLocaleString("en-NG")}`} />
          )}
          <DetailRow
            label="You receive"
            value={<span className="font-semibold">₦{ngn.toLocaleString("en-NG")}</span>}
          />
          {tx.memo && <DetailRow label="Memo" value={tx.memo} />}
          {tx.payout?.providerReference && (
            <DetailRow label="Paystack Ref" value={<code className="text-xs font-mono">{tx.payout.providerReference}</code>} />
          )}
        </section>

        {/* ── Blockchain ── */}
        {tx.txHash && (
          <section className="mt-4 rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm divide-y divide-white/[0.06] overflow-hidden">
            <div className="px-4 py-3">
              <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-white/40 mb-2">Blockchain</p>
              <p className="text-xs text-white/50 font-medium mb-1">Transaction Hash</p>
              <p className="font-mono text-[0.65rem] text-white/70 break-all leading-relaxed">
                {tx.txHash}
              </p>
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-400"
                >
                  View on BaseScan
                  <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V7M8 1h3m0 0v3m0-3L5 7" />
                  </svg>
                </a>
              )}
            </div>
            <DetailRow label="Network" value="Base Sepolia" />
            {tx.chainId && <DetailRow label="Chain ID" value={String(tx.chainId)} />}
          </section>
        )}

        {/* ── Timeline ── */}
        <section className="mt-4">
          <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-widest text-white/40 px-1">
            Timeline
          </p>
          <div className="rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm px-4 py-4">
            <ol className="space-y-4">
              {steps.map((step, i) => (
                <TimelineStep
                  key={step.label}
                  label={step.label}
                  description={step.description}
                  done={step.done}
                  active={step.active}
                  failed={step.failed}
                  isLast={i === steps.length - 1}
                />
              ))}
            </ol>
          </div>
        </section>

        {/* ── Payout details ── */}
        {tx.payout && (
          <section className="mt-4 rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm divide-y divide-white/[0.06] overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-white/40">Bank Payout</p>
            </div>
            <DetailRow label="Provider" value={tx.payout.provider} />
            <DetailRow label="Amount" value={`₦${BigInt(tx.payout.amountNgn).toLocaleString("en-NG")}`} />
            <DetailRow label="Bank" value={tx.payout.bankName} />
            {tx.payout.accountName && <DetailRow label="Account Name" value={tx.payout.accountName} />}
            <DetailRow label="Status" value={tx.payout.status} />
            {tx.payout.providerReference && (
              <DetailRow label="Reference" value={<code className="text-xs font-mono">{tx.payout.providerReference}</code>} />
            )}
          </section>
        )}
      </div>
    </Screen>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-xs text-white/50 shrink-0">{label}</span>
      <span className="text-xs font-medium text-white/90 text-right">{value}</span>
    </div>
  )
}

function TimelineStep({
  label,
  description,
  done,
  active,
  failed,
  isLast,
}: {
  label: string
  description?: string
  done: boolean
  active: boolean
  failed: boolean
  isLast: boolean
}) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={[
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
            failed
              ? "bg-red-100 text-red-600"
              : done
              ? "bg-green-100 text-green-600"
              : active
              ? "bg-blue-100 text-emerald-400 animate-pulse"
              : "bg-white/[0.07] text-white/40",
          ].join(" ")}
        >
          {failed ? "✕" : done ? "✓" : active ? "◉" : "○"}
        </div>
        {!isLast && (
          <div className={`mt-1 w-px flex-1 ${done ? "bg-green-200" : "bg-white/[0.07]"}`} style={{ minHeight: 16 }} />
        )}
      </div>
      <div className="pb-3">
        <p className={`text-xs font-semibold ${failed ? "text-red-600" : done ? "text-white/90" : active ? "text-emerald-400" : "text-white/40"}`}>
          {label}
        </p>
        {description && <p className="mt-0.5 text-[0.68rem] text-white/40">{description}</p>}
      </div>
    </li>
  )
}

// ─── Timeline builder ─────────────────────────────────────────────────────────

type Step = {
  label: string
  description?: string
  done: boolean
  active: boolean
  failed: boolean
}

const STATUS_ORDER = [
  "created",
  "awaiting_payment",
  "blockchain_detected",
  "blockchain_confirmed",
  "payout_pending",
  "payout_processing",
  "completed",
]

function buildTimeline(tx: Transaction): Step[] {
  const currentIdx = STATUS_ORDER.indexOf(tx.status)

  const steps: Step[] = [
    {
      label: "Transaction created",
      description: "Payment request initiated",
      done: true,
      active: false,
      failed: false,
    },
    {
      label: "Awaiting USDC payment",
      description: "Waiting for on-chain USDC transfer",
      done: currentIdx > STATUS_ORDER.indexOf("awaiting_payment"),
      active: tx.status === "awaiting_payment",
      failed: tx.status === "blockchain_failed" && currentIdx <= 1,
    },
    {
      label: "Blockchain confirmation",
      description: `Base Sepolia · ${tx.txHash ? tx.txHash.slice(0, 10) + "..." : "pending"}`,
      done: currentIdx >= STATUS_ORDER.indexOf("blockchain_confirmed"),
      active: tx.status === "blockchain_detected",
      failed: tx.status === "blockchain_failed",
    },
    {
      label: "NGN payout initiated",
      description: "Sending to your bank account",
      done: currentIdx >= STATUS_ORDER.indexOf("payout_processing"),
      active: tx.status === "payout_pending",
      failed: tx.status === "payout_failed" && currentIdx >= STATUS_ORDER.indexOf("payout_pending"),
    },
    {
      label: "Payout completed",
      description: tx.payout?.providerReference
        ? `Ref: ${tx.payout.providerReference}`
        : "Funds sent to bank",
      done: tx.status === "completed",
      active: tx.status === "payout_processing",
      failed:
        (tx.status === "payout_failed" && currentIdx >= STATUS_ORDER.indexOf("payout_processing")),
    },
  ]

  return steps
}

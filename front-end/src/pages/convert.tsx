/**
 * XPay Convert — sell USDC for Naira.
 *
 * Flow: amount → bank_account → bank_confirm → review → pin → sending → done
 */

import { useState, useCallback, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Screen, Title } from "@/components/Screen"
import { Button } from "@/components/Button"
import { Field } from "@/components/Field"
import { CodeInput } from "@/components/CodeInput"
import { Badge } from "@/components/Badge"
import { Spinner } from "@/components/icons"
import {
  getBanks, resolveBankAccount, getQuote, getTransaction,
  sendToBank,
} from "@/lib/api"
import { formatUSD } from "@/lib/money"
import { useSession } from "@/lib/session"
import { useUsdcBalance } from "@/lib/useUsdcBalance"
import { useNetwork } from "@/lib/NetworkContext"
import { isTerminal, statusLabel } from "@/lib/txStatus"
import { getTokenLogo } from "@/assets/logos"
import type { Bank, BankResolveResult, Quote, Transaction } from "@/lib/types"

type Step = "amount" | "bank_account" | "bank_confirm" | "review" | "pin" | "sending" | "done"
type InputMode = "usdc" | "ngn"

function friendlyError(reason: string): string {
  switch (reason) {
    case "wrong_pin":       return "Incorrect PIN. Try again."
    case "locked":          return "Too many wrong PINs. Account is temporarily locked."
    case "insufficient":    return "Not enough USDC balance."
    case "quote_expired":   return "Your rate expired. Please start again."
    case "invalid_account": return "Account not found. Check the number and bank."
    case "bank_not_found":  return "Bank not recognised. Please search again."
    case "server_error":    return "Something went wrong. Please try again."
    default:                return `Something went wrong (${reason}). Please try again.`
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${highlight ? "bg-emerald-500/10 rounded-b-xl" : "border-t border-white/[0.06]"}`}>
      <span className={`text-sm ${highlight ? "font-semibold text-white/90" : "text-white/50"}`}>{label}</span>
      <span className={`text-sm tabular-nums ${highlight ? "font-bold text-emerald-400 text-base" : "font-medium text-white/90"}`}>{value}</span>
    </div>
  )
}

export default function Convert() {
  const navigate = useNavigate()
  const { authUser, loading } = useSession()
  const { activeChain } = useNetwork()
  const { balance, refresh: refreshBalance } = useUsdcBalance(activeChain)

  const [step, setStep] = useState<Step>("amount")
  const [liveRate, setLiveRate] = useState<number | null>(null)
  const [rateLoading, setRateLoading] = useState(true)
  const [rateError, setRateError] = useState(false)

  // ── dual-input state ──
  // `inputMode` tracks which field the user last typed in.
  // Both fields are always rendered as <input> elements.
  // The "other" field's value is always derived from the current quote/rate
  // and stored in a separate display state so the active field is never
  // overwritten while the user is typing.
  const [inputMode, setInputMode] = useState<InputMode>("usdc")
  const [usdcRaw, setUsdcRaw] = useState("")   // raw text in YOU PAY input
  const [ngnRaw, setNgnRaw] = useState("")     // raw text in YOU RECEIVE input (digits only)
  const [memo, setMemo] = useState("")

  // Derived display for the non-active field.
  // These are updated only after a quote comes back.
  const [derivedUsdcDisplay, setDerivedUsdcDisplay] = useState("") // shown when mode=ngn
  const [derivedNgnDisplay, setDerivedNgnDisplay] = useState("")   // shown when mode=usdc

  // ── live quote ──
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── bank ──
  const [banks, setBanks] = useState<Bank[]>([])
  const [bankSearch, setBankSearch] = useState("")
  const [bankOpen, setBankOpen] = useState(false)
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null)
  const [accountNumber, setAccountNumber] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [verifiedAccount, setVerifiedAccount] =
    useState<(BankResolveResult & { success: true }) | null>(null)
  const bankDropdownRef = useRef<HTMLDivElement>(null)

  // ── pin / send ──
  const [pin, setPin] = useState("")
  const [pinError, setPinError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // ── done ──
  const [receipt, setReceipt] = useState<Transaction | null>(null)
  const [polledTx, setPolledTx] = useState<Transaction | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // When mode=usdc: usdcAmount comes from quote.amount (set by handleUsdcChange).
  // When mode=ngn:  usdcAmount comes from quote.amount too (set by handleNgnChange).
  const usdcAmount = quote ? BigInt(quote.amount) : null
  const overBalance = balance !== null && usdcAmount !== null && usdcAmount > balance

  // ── update derived displays whenever a quote arrives ──
  useEffect(() => {
    if (!quote) return
    if (inputMode === "usdc") {
      // user typed USDC → derive NGN
      const ngn = BigInt(quote.ngnAmount)
      setDerivedNgnDisplay(ngn > 0n ? ngn.toLocaleString("en-NG") : "")
    } else {
      // user typed NGN → derive USDC (2 dp)
      const u = BigInt(quote.amount)
      const whole = u / 1_000_000n
      const frac = (u % 1_000_000n).toString().padStart(6, "0").slice(0, 2)
      setDerivedUsdcDisplay(u > 0n ? (frac !== "00" ? `${whole}.${frac}` : whole.toString()) : "")
    }
  }, [quote, inputMode])

  // ── auth guard ──
  useEffect(() => {
    if (!loading && !authUser) navigate("/login", { replace: true })
  }, [loading, authUser, navigate])

  // ── bootstrap ──
  useEffect(() => {
    void getBanks().then(setBanks).catch(() => null)
    void fetchRate()
  }, [])

  // ── retry rate fetch ──
  async function fetchRate() {
    setRateLoading(true)
    setRateError(false)
    try {
      // 1st choice: backend (has spread/fee baked in)
      const q = await getQuote(1_000_000n)
      setLiveRate(q.fxRate)
      setRateLoading(false)
      return
    } catch {
      // backend unavailable — fall through
    }
    try {
      // 2nd choice: public exchange rate API (no key required)
      const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD")
      if (!res.ok) throw new Error("rate api error")
      const data = await res.json() as { rates: Record<string, number> }
      const ngn = data.rates["NGN"]
      if (ngn && ngn > 0) {
        setLiveRate(Math.round(ngn))
        setRateLoading(false)
        return
      }
    } catch {
      // both sources failed
    }
    setRateError(true)
    setRateLoading(false)
  }

  function retryRate() { void fetchRate() }

  // ── poll done tx ──
  useEffect(() => {
    if (step !== "done" || !receipt) return
    pollRef.current = setInterval(async () => {
      const tx = await getTransaction(receipt.id).catch(() => null)
      if (!tx) return
      setPolledTx(tx)
      if (isTerminal(tx.status) && pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }, 4000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [step, receipt])

  // ── outside-click bank dropdown ──
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (bankDropdownRef.current && !bankDropdownRef.current.contains(e.target as Node)) {
        setBankOpen(false); setBankSearch("")
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const filteredBanks = banks
    .filter(b => b.name.toLowerCase().includes(bankSearch.toLowerCase()))
    .slice(0, 60)

  // ── live quote fetch (debounced 600 ms) ──
  // Tries the backend first; if unavailable, builds a synthetic quote from the
  // live rate we already fetched from the public exchange rate API.
  const fetchLiveQuote = useCallback((usdcUnits: bigint) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (usdcUnits <= 0n) {
      setQuote(null); setQuoteError(null); setQuoteLoading(false); return
    }
    setQuoteLoading(true)
    setQuoteError(null)
    debounceRef.current = setTimeout(async () => {
      try {
        const q = await getQuote(usdcUnits)
        setQuote(q)
        setLiveRate(q.fxRate)
        setQuoteLoading(false)
        return
      } catch {
        // backend unavailable — build a synthetic quote from the live rate
      }

      const rate = liveRate
      if (rate && rate > 0) {
        // Compute NGN gross, then deduct 0.5% platform fee
        const ngnGross = (usdcUnits * BigInt(Math.round(rate))) / 1_000_000n
        const feeNgn = ngnGross / 200n              // 0.5% = divide by 200
        const ngnNet = ngnGross - feeNgn
        const syntheticQuote: Quote = {
          id: `local_${Date.now()}`,
          asset: "USDC",
          amount: usdcUnits.toString(),
          fxRate: rate,
          feeNgn: feeNgn.toString(),
          ngnAmountGross: ngnGross.toString(),
          ngnAmount: ngnNet.toString(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        }
        setQuote(syntheticQuote)
        setQuoteError(null)
      } else {
        setQuoteError("Could not get rate. Please try again.")
        setQuote(null)
      }
      setQuoteLoading(false)
    }, 600)
  }, [liveRate])

  // ── input handlers ──

  // Sanitise a decimal string: digits + at most one dot, cap integer part at 9 digits,
  // fractional part at 6 digits (USDC precision).
  function sanitiseUsdc(raw: string): string {
    let clean = raw.replace(/[^\d.]/g, "")
    const parts = clean.split(".")
    if (parts.length > 2) clean = parts[0] + "." + parts.slice(1).join("")
    const [int = "", frac] = clean.split(".")
    const cappedInt = int.slice(0, 9)
    if (frac !== undefined) {
      return cappedInt + "." + frac.slice(0, 6)
    }
    return cappedInt
  }

  function handleUsdcChange(raw: string) {
    const clean = sanitiseUsdc(raw)
    setUsdcRaw(clean)
    setInputMode("usdc")
    setQuote(null)
    setQuoteError(null)
    setDerivedNgnDisplay("") // clear the other field while user types

    if (!clean || clean === ".") {
      setNgnRaw("")           // clear NGN side too
      fetchLiveQuote(0n)
      return
    }
    const [whole = "0", frac = ""] = clean.split(".")
    const padded = frac.padEnd(6, "0")
    const units = BigInt(whole) * 1_000_000n + BigInt(padded)
    fetchLiveQuote(units)
  }

  function handleNgnChange(raw: string) {
    // Accept formatted input (with commas) or plain digits
    const digits = raw.replace(/\D/g, "").slice(0, 12)
    setNgnRaw(digits)
    setInputMode("ngn")
    setQuote(null)
    setQuoteError(null)
    setDerivedUsdcDisplay("") // clear the other field while user types

    if (!digits || digits === "0") {
      setUsdcRaw("")           // clear USDC side too
      fetchLiveQuote(0n)
      return
    }
    const ngn = BigInt(digits)
    const rate = liveRate ?? 1600
    const usdcApprox = (ngn * 1_000_000n) / BigInt(rate)
    fetchLiveQuote(usdcApprox)
  }

  // ── Max button ──
  function handleMax() {
    if (balance === null || balance === 0n) return
    // Format balance (6-decimal USDC) as a decimal string, 2 dp
    const whole = balance / 1_000_000n
    const frac = (balance % 1_000_000n).toString().padStart(6, "0").slice(0, 2)
    const display = frac !== "00" ? `${whole}.${frac}` : whole.toString()
    handleUsdcChange(display) // reuse handler: sets mode=usdc, triggers quote fetch
  }

  // NGN display: show formatted value with commas so the input looks natural
  const ngnDisplayValue = (() => {
    if (inputMode === "ngn") {
      // Format raw digits with commas for display
      return ngnRaw ? BigInt(ngnRaw).toLocaleString("en-NG") : ""
    }
    return derivedNgnDisplay
  })()

  // ── derived display values ──
  // (kept as simple pass-throughs; the real work is in the useEffect above)

  // ── continue from amount ──
  async function handleContinueAmount() {
    if (!quote || quoteLoading || overBalance) return
    setStep("bank_account")
  }

  async function ensureFreshQuote() {
    if (quote && !quoteLoading) { handleContinueAmount(); return }
    setQuoteLoading(true)
    setQuoteError(null)
    try {
      let usdcUnits: bigint
      if (inputMode === "ngn" && ngnRaw) {
        const rate = liveRate ?? 1600
        usdcUnits = (BigInt(ngnRaw) * 1_000_000n) / BigInt(rate)
      } else if (inputMode === "usdc" && usdcRaw) {
        const [whole = "0", frac = ""] = usdcRaw.split(".")
        usdcUnits = BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, "0"))
      } else {
        return
      }

      // Try backend first
      try {
        const q = await getQuote(usdcUnits)
        setQuote(q)
        setLiveRate(q.fxRate)
        setStep("bank_account")
        return
      } catch {
        // backend unavailable — fall through to synthetic quote
      }

      // Build synthetic quote from live rate with 0.5% platform fee
      const rate = liveRate
      if (rate && rate > 0) {
        const ngnGross = (usdcUnits * BigInt(Math.round(rate))) / 1_000_000n
        const feeNgn = ngnGross / 200n              // 0.5% = divide by 200
        const ngnNet = ngnGross - feeNgn
        const syntheticQuote: Quote = {
          id: `local_${Date.now()}`,
          asset: "USDC",
          amount: usdcUnits.toString(),
          fxRate: rate,
          feeNgn: feeNgn.toString(),
          ngnAmountGross: ngnGross.toString(),
          ngnAmount: ngnNet.toString(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        }
        setQuote(syntheticQuote)
        setStep("bank_account")
      } else {
        setQuoteError("Could not get rate. Please try again.")
      }
    } finally {
      setQuoteLoading(false)
    }
  }

  // ── verify bank ──
  async function verifyBank() {
    if (!selectedBank || accountNumber.length !== 10 || verifying) return
    setVerifying(true); setVerifyError(null)
    try {
      const result = await resolveBankAccount(selectedBank.code, accountNumber)
      if (!result.success) { setVerifyError(friendlyError(result.reason)); return }
      setVerifiedAccount(result)
      setStep("bank_confirm")
    } catch (e) {
      const msg = e instanceof Error ? e.message : ""
      if (msg.includes("backend_unavailable") || msg.includes("backend")) {
        setVerifyError("Account verification is unavailable right now — the backend is offline. Please try again later.")
      } else {
        setVerifyError("Could not verify account. Check your connection and try again.")
      }
    } finally {
      setVerifying(false)
    }
  }

  // ── pin ──
  function handlePin(next: string) {
    if (submitting) return
    setPinError(null); setPin(next)
    if (next.length === 4) void submitConvert(next)
  }

  // ── submit ──
  async function submitConvert(pinValue: string) {
    if (!usdcAmount || !quote || !verifiedAccount || submitting) return
    setSubmitting(true); setStep("sending")
    try {
      const result = await sendToBank({
        bankCode: verifiedAccount.bankCode,
        accountNumber: verifiedAccount.accountNumber,
        accountName: verifiedAccount.accountName,
        quoteId: quote.id,
        memo: memo || "Convert to NGN",
        pin: pinValue,
        idempotencyKey: `convert_${quote.id}`,
      })
      if (!result.ok) {
        setPinError(friendlyError(result.reason)); setPin(""); setStep("pin"); return
      }
      setReceipt(result.transaction); setStep("done")
      void refreshBalance()  // refresh on-chain balance after successful conversion
    } catch {
      setPinError("Network error. Please try again."); setPin(""); setStep("pin")
    } finally {
      setSubmitting(false)
    }
  }

  if (!authUser) return <div className="min-h-dvh bg-[#1a1a1c]" />

  // ══════════════════════════════════════════════════════════════════════════
  // DONE
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "done") {
    const tx = polledTx ?? receipt
    if (!tx) return <div className="min-h-dvh bg-[#1a1a1c]" />
    const usd = BigInt(tx.amount); const ngn = BigInt(tx.ngnAmount)
    const pending = !isTerminal(tx.status)
    const failed = tx.status === "blockchain_failed" || tx.status === "payout_failed" || tx.status === "cancelled"
    const iconBg = pending ? "bg-emerald-500/10 ring-blue-50/50" : failed ? "bg-red-50 ring-red-50/50" : "bg-green-50 ring-green-50/50"
    const iconColor = pending ? "#2563eb" : failed ? "#dc2626" : "#16a34a"
    return (
      <Screen back onBack={() => navigate(-1)}>
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-16 text-center">
          <div className={`flex h-20 w-20 items-center justify-center rounded-full ring-8 ${iconBg}`}>
            {pending ? <Spinner className="h-8 w-8 text-emerald-400" />
              : failed
                ? <svg viewBox="0 0 32 32" width="36" height="36" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round"><path d="M8 8l16 16M24 8L8 24"/></svg>
                : <svg viewBox="0 0 32 32" width="36" height="36" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 16l8 8 12-14"/></svg>}
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-white/90">
            {pending ? "Converting…" : failed ? "Conversion failed" : "Converted!"}
          </h1>
          {!failed && (
            <div className="mt-5 rounded-2xl border border-white/[0.06] bg-[#161618] px-8 py-5 text-center">
              <p className="text-3xl font-bold tabular-nums text-white/90">₦{ngn.toLocaleString("en-NG")}</p>
              <p className="mt-1 text-sm text-white/40 tabular-nums">from {formatUSD(usd)} USDC</p>
            </div>
          )}
          <div className="mt-5 flex w-full max-w-sm items-center gap-3 rounded-2xl border border-white/[0.06] bg-black px-5 py-4 shadow-sm text-left">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white/90 truncate">{tx.recipientDisplayName}</p>
              {tx.recipientBankName && (
                <p className="text-xs text-white/50 truncate">{tx.recipientBankName} · ****{tx.recipientAccountNumberLast4}</p>
              )}
              <div className="mt-1">
                <Badge variant={pending ? "blue" : failed ? "red" : "green"}>{statusLabel(tx.status)}</Badge>
              </div>
            </div>
          </div>
          {pending && <p className="mt-4 max-w-xs text-xs leading-relaxed text-white/40">Naira is being sent to your bank account. This usually takes a few minutes.</p>}
        </div>
        <div className="shrink-0 px-5 pb-10">
          <Button full size="lg" onClick={() => navigate("/home", { replace: true })}>Back to home</Button>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SENDING
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "sending") {
    return (
      <Screen back onBack={() => navigate(-1)}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <Spinner className="h-7 w-7 text-emerald-400" />
          <div className="text-center">
            <p className="text-sm font-semibold text-white/80">Converting to Naira…</p>
            <p className="mt-1 text-xs text-white/40">Do not close this screen.</p>
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PIN
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "pin" && usdcAmount !== null && verifiedAccount) {
    return (
      <Screen back onBack={() => { if (!submitting) { setStep("review"); setPin(""); setPinError(null) } }}>
        <div className="flex flex-1 flex-col pt-4 pb-10">
          <Title sub="Enter your 4-digit PIN to authorise this conversion.">Confirm conversion</Title>

          {/* Summary card */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.06] bg-black shadow-sm">
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white/90 truncate">{verifiedAccount.accountName}</p>
                <p className="text-xs text-white/50">{verifiedAccount.bankName} · ****{verifiedAccount.accountNumber.slice(-4)}</p>
              </div>
              {quote && (
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums text-white/90">₦{BigInt(quote.ngnAmount).toLocaleString("en-NG")}</p>
                  <p className="text-xs text-white/40 tabular-nums">{formatUSD(usdcAmount)} USDC</p>
                </div>
              )}
            </div>
            {quote && (
              <div className="border-t border-white/[0.06]">
                <SummaryRow label="Rate" value={`$1 = ₦${quote.fxRate.toLocaleString()}`} />
                <SummaryRow label="Fee" value={BigInt(quote.feeNgn) === 0n ? "Free 🎉" : `₦${BigInt(quote.feeNgn).toLocaleString()}`} />
                <SummaryRow label="You receive" value={`₦${BigInt(quote.ngnAmount).toLocaleString()}`} highlight />
              </div>
            )}
          </div>

          <div className="mt-8 text-center">
            <CodeInput label="4-digit PIN" length={4} value={pin} onChange={handlePin} secret autoFocus error={!!pinError} />
            {pinError && <p className="mt-2 text-sm text-red-600">{pinError}</p>}
            {submitting
              ? <p className="mt-3 flex items-center justify-center gap-2 text-xs text-white/40"><Spinner className="h-3 w-3" /> Processing…</p>
              : <p className="mt-3 text-xs text-white/40">Your PIN securely authorises this conversion.</p>
            }
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REVIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "review" && verifiedAccount) {
    return (
      <Screen back onBack={() => setStep("bank_confirm")}>
        <div className="flex flex-1 flex-col pt-4 pb-10">
          <Title sub="Check the details before continuing.">Review conversion</Title>
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.06] bg-black shadow-sm">
            {/* Recipient */}
            <div className="p-4">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-white/40">Receiving account</p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-white/90">{verifiedAccount.accountName}</p>
                  <p className="text-sm text-white/50">{verifiedAccount.bankName} · ****{verifiedAccount.accountNumber.slice(-4)}</p>
                </div>
              </div>
            </div>

            {/* Quote breakdown */}
            <div className="border-t border-white/[0.06]">
              {quoteLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-white/40">
                  <Spinner className="h-4 w-4 text-blue-500" />Getting your rate…
                </div>
              ) : quoteError ? (
                <div className="px-4 py-4">
                  <p className="text-sm text-red-600">{quoteError}</p>
                  <button type="button" className="mt-2 text-xs font-semibold text-emerald-400 underline"
                    onClick={() => usdcAmount && void getQuote(usdcAmount).then(setQuote).catch(() => setQuoteError("Could not get rate. Please try again."))}>
                    Retry
                  </button>
                </div>
              ) : quote ? (
                <>
                  <SummaryRow label="You sell" value={`${formatUSD(BigInt(quote.amount))} USDC`} />
                  <SummaryRow label="Exchange rate" value={`$1 = ₦${quote.fxRate.toLocaleString()}`} />
                  <SummaryRow label="Fee" value={BigInt(quote.feeNgn) === 0n ? <Badge variant="green">Free</Badge> : `₦${BigInt(quote.feeNgn).toLocaleString()}`} />
                  <SummaryRow label="You receive" value={`₦${BigInt(quote.ngnAmount).toLocaleString()}`} highlight />
                </>
              ) : null}
            </div>
          </div>
          {quote && (
            <p className="mt-2 text-center text-xs text-white/40">
              Rate valid until {new Date(quote.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          <div className="mt-auto pt-6">
            <Button full size="lg" disabled={quoteLoading || !quote || !!quoteError} onClick={() => setStep("pin")}>
              Continue to PIN
            </Button>
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BANK CONFIRM
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "bank_confirm" && verifiedAccount) {
    return (
      <Screen back onBack={() => { setStep("bank_account"); setVerifiedAccount(null) }} title="Confirm account">
        <div className="flex flex-1 flex-col pt-4 pb-10">
          <Title sub="Make sure this is your account.">Confirm account</Title>
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.06] bg-black shadow-sm">
            <div className="flex items-center justify-center py-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 ring-8 ring-green-50/60">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7"/>
                </svg>
              </div>
            </div>
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              <div className="flex justify-between px-5 py-3.5"><span className="text-sm text-white/50">Bank</span><span className="text-sm font-semibold text-white/90">{verifiedAccount.bankName}</span></div>
              <div className="flex justify-between px-5 py-3.5"><span className="text-sm text-white/50">Account number</span><span className="text-sm font-semibold tabular-nums text-white/90">****{verifiedAccount.accountNumber.slice(-4)}</span></div>
              <div className="flex justify-between bg-[#161618] px-5 py-4"><span className="text-sm text-white/50">Account name</span><span className="text-sm font-bold uppercase tracking-wide text-white/90">{verifiedAccount.accountName}</span></div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs leading-relaxed text-amber-700">
              Naira will be sent to this account. Ensure this belongs to you.
            </p>
          </div>
          <div className="mt-auto space-y-3 pt-6">
            <Button full size="lg" onClick={() => setStep("review")}>Yes, this is my account</Button>
            <Button full variant="secondary" onClick={() => { setStep("bank_account"); setVerifiedAccount(null) }}>Change account</Button>
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BANK ACCOUNT ENTRY
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "bank_account") {
    const canVerify = !!selectedBank && accountNumber.length === 10 && !verifying
    return (
      <Screen back onBack={() => { setStep("amount"); setSelectedBank(null); setBankSearch(""); setAccountNumber(""); setVerifyError(null) }} title="Your bank account">
        <div className="flex flex-1 flex-col pt-4 pb-10">
          <Title sub="Enter the bank account where you want to receive naira.">Your bank account</Title>
          <div className="mt-6 space-y-4">
            {/* Bank selector */}
            <div ref={bankDropdownRef} className="relative">
              <label className="mb-1.5 block text-sm font-medium text-white/70">Bank</label>
              <div
                role="combobox"
                aria-expanded={bankOpen}
                aria-haspopup="listbox"
                tabIndex={0}
                onClick={() => setBankOpen(v => !v)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBankOpen(v => !v) }
                  if (e.key === "Escape") { setBankOpen(false); setBankSearch("") }
                }}
                className={[
                  "flex h-12 cursor-pointer select-none items-center gap-2 rounded-xl border bg-[#111113] px-4 transition-colors focus:outline-none",
                  bankOpen ? "border-emerald-500/60" : "border-white/[0.12] hover:border-white/25",
                ].join(" ")}
              >
                {bankOpen ? (
                  <input
                    value={bankSearch}
                    onChange={e => setBankSearch(e.target.value)}
                    placeholder="Search banks…"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                    className="min-w-0 flex-1 bg-transparent text-base text-white/90 outline-none placeholder:text-white/40"
                  />
                ) : (
                  <span className={`flex-1 text-base ${selectedBank ? "text-white/90 font-medium" : "text-white/40"}`}>
                    {selectedBank ? selectedBank.name : "Select your bank"}
                  </span>
                )}
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  className={`shrink-0 transition-transform duration-150 ${bankOpen ? "rotate-180" : ""}`}>
                  <path d="M5 8l5 5 5-5"/>
                </svg>
              </div>
              {bankOpen && (
                <ul role="listbox" aria-label="Banks"
                  className="absolute z-[200] mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-white/[0.12] shadow-[0_8px_32px_rgba(0,0,0,0.7)]"
                  style={{ backgroundColor: "#111113" }}>
                  {filteredBanks.length === 0
                    ? <li className="px-4 py-3 text-sm text-white/40">No banks found.</li>
                    : filteredBanks.map((bank, i) => (
                      <li key={bank.code} role="option" aria-selected={selectedBank?.code === bank.code}
                        onMouseDown={e => { e.preventDefault(); setSelectedBank(bank); setBankSearch(""); setBankOpen(false); setVerifyError(null) }}
                        className={[
                          "flex min-h-[44px] cursor-pointer items-center px-4 py-3 text-sm transition-colors",
                          selectedBank?.code === bank.code
                            ? "bg-[#1e2e1e] font-semibold text-emerald-400"
                            : "text-white/90 hover:bg-[#1c1c1e]",
                          i > 0 ? "border-t border-white/[0.06]" : "",
                        ].join(" ")}>
                        {bank.name}
                      </li>
                    ))}
                </ul>
              )}
            </div>

            <Field
              label="Account number"
              value={accountNumber}
              onChange={e => { setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10)); setVerifyError(null) }}
              inputMode="numeric"
              placeholder="0123456789"
              maxLength={10}
              autoComplete="off"
              error={verifyError}
              hint={accountNumber.length > 0 && accountNumber.length < 10 ? `${accountNumber.length} of 10 digits` : accountNumber.length === 0 ? "Nigerian account numbers are exactly 10 digits" : undefined}
              suffix={
                accountNumber.length === 10
                  ? <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10l5 5 7-9"/></svg>
                  : <span className="text-xs font-medium tabular-nums text-white/40">{accountNumber.length}/10</span>
              }
            />
          </div>
          <div className="mt-auto pt-6">
            <Button full size="lg" disabled={!canVerify} loading={verifying} onClick={verifyBank}>
              {verifying ? "Verifying account…" : "Verify account"}
            </Button>
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AMOUNT — both fields always editable, Max button, two-way sync
  // ══════════════════════════════════════════════════════════════════════════
  const hasInput = usdcRaw.length > 0 || ngnRaw.length > 0
  const canContinue = hasInput && !!quote && !quoteLoading && !overBalance

  return (
    <Screen back onBack={() => navigate(-1)} title="Send to Bank">
      <div className="flex flex-1 flex-col px-5 pt-4 pb-10">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-medium tracking-tight text-white/90">Send to Nigerian bank</h1>
          <p className="mt-1 text-[13px] text-white/40">Sell USDC and receive Naira to your bank account.</p>
        </div>

        {/* Live rate — plain inline text, no border/box */}
        <div className="mb-5 flex items-center gap-2">
          <span className="text-[13px] text-white/40">Live rate</span>
          {rateLoading ? (
            <span className="flex items-center gap-1.5 text-[13px] text-white/30">
              <Spinner className="h-3 w-3" /> Fetching…
            </span>
          ) : rateError ? (
            <button onClick={retryRate} className="text-[13px] font-medium text-red-400 underline">
              Failed · Retry
            </button>
          ) : (
            <span className="text-[13px] font-semibold tabular-nums text-white/90">
              $1 = ₦{liveRate?.toLocaleString() ?? "…"}
            </span>
          )}
        </div>

        {/* YOU PAY row — always an <input> */}
        <div className="border-t border-white/[0.08] py-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/25">You pay</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <input
                value={inputMode === "usdc" ? usdcRaw : derivedUsdcDisplay}
                onChange={e => handleUsdcChange(e.target.value)}
                onFocus={() => {
                  // switching focus to USDC: seed the field with the derived value
                  // so the user can edit it directly without it blanking
                  if (inputMode === "ngn" && derivedUsdcDisplay) {
                    setUsdcRaw(derivedUsdcDisplay)
                    setInputMode("usdc")
                  }
                }}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full bg-transparent text-[32px] font-medium tabular-nums text-white/90 outline-none placeholder:text-white/25"
              />
            </div>
            {/* Token badge */}
            <div className="flex shrink-0 items-center gap-1.5">
              <img src={getTokenLogo("USDC")} alt="USDC" className="h-5 w-5 rounded-full" />
              <span className="text-[13px] font-medium text-white/50">USDC</span>
            </div>
          </div>
        </div>

        {/* YOU RECEIVE row — always an <input> */}
        <div className="border-t border-white/[0.08] py-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/25">You receive</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <input
                value={ngnDisplayValue}
                onChange={e => handleNgnChange(e.target.value)}
                onFocus={() => {
                  // switching focus to NGN: seed the raw digits if we have a derived value
                  if (inputMode === "usdc" && derivedNgnDisplay) {
                    // derivedNgnDisplay is already formatted "1,234,567" — strip commas
                    const digits = derivedNgnDisplay.replace(/\D/g, "")
                    setNgnRaw(digits)
                    setInputMode("ngn")
                  }
                }}
                inputMode="numeric"
                placeholder="₦0"
                className="w-full bg-transparent text-[32px] font-medium tabular-nums text-white/90 outline-none placeholder:text-white/25"
              />
            </div>
            <span className="shrink-0 text-[13px] font-medium text-white/50">NGN</span>
          </div>
        </div>

        <div className="border-t border-white/[0.08]" />

        {/* Available balance + Max button + errors */}
        <div className="mt-3 space-y-1.5">
          {/* Balance row with Max button */}
          <div className="flex items-center justify-between">
            <p className={`text-[13px] tabular-nums ${overBalance ? "text-red-400" : "text-white/30"}`}>
              {overBalance
                ? "Insufficient balance"
                : balance !== null
                  ? `Available: ${formatUSD(balance)} USDC`
                  : ""}
            </p>
            {balance !== null && balance > 0n && (
              <button
                type="button"
                onClick={handleMax}
                className="rounded-md border border-white/[0.12] px-2 py-0.5 text-[12px] font-semibold text-white/50 transition hover:border-white/25 hover:text-white/80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
              >
                Max
              </button>
            )}
          </div>

          {quoteError && !quoteLoading && (
            <div className="flex items-center gap-2">
              <p className="text-[13px] text-red-400">{quoteError}</p>
              <button
                onClick={() => {
                  setQuoteError(null)
                  if (inputMode === "usdc" && usdcRaw) handleUsdcChange(usdcRaw)
                  else if (inputMode === "ngn" && ngnRaw) handleNgnChange(ngnRaw)
                }}
                className="text-[13px] font-medium text-emerald-400 underline"
              >
                Retry
              </button>
            </div>
          )}

          {quote && !quoteError && !overBalance && (
            <p className="text-[13px] text-white/35 tabular-nums">
              Fee: {BigInt(quote.feeNgn) === 0n ? "Free" : `₦${BigInt(quote.feeNgn).toLocaleString()}`}
              {" · "}You receive{" "}
              <span className="font-medium text-white/60">₦{BigInt(quote.ngnAmount).toLocaleString()}</span>
            </p>
          )}
        </div>

        {/* Note field + Next button */}
        <div className="mt-auto pt-6 space-y-3">
          <input
            value={memo}
            onChange={e => setMemo(e.target.value.slice(0, 60))}
            placeholder="Add a note (optional)"
            maxLength={60}
            className="h-12 w-full rounded-xl border border-white/[0.12] bg-transparent px-4 text-[14px] text-white/80 outline-none transition placeholder:text-white/30 focus:border-white/30"
          />
          <button
            type="button"
            disabled={!canContinue}
            onClick={ensureFreshQuote}
            className={[
              "flex h-12 w-full items-center justify-center rounded-xl text-[14px] font-semibold transition",
              canContinue
                ? "bg-emerald-500 text-white hover:bg-emerald-400 active:scale-[.98]"
                : "cursor-not-allowed bg-white/[0.06] text-white/25",
            ].join(" ")}
          >
            {quoteLoading && hasInput
              ? <span className="flex items-center gap-2"><Spinner className="h-4 w-4" /> Getting rate…</span>
              : "Next"}
          </button>
        </div>
      </div>
    </Screen>
  )
}

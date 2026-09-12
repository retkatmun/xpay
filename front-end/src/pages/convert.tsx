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
    <div className={`flex items-center justify-between px-4 py-3 ${highlight ? "bg-blue-50 rounded-b-xl" : "border-t border-gray-100"}`}>
      <span className={`text-sm ${highlight ? "font-semibold text-gray-900" : "text-gray-500"}`}>{label}</span>
      <span className={`text-sm tabular-nums ${highlight ? "font-bold text-blue-600 text-base" : "font-medium text-gray-900"}`}>{value}</span>
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
  const [inputMode, setInputMode] = useState<InputMode>("ngn")
  const [usdcRaw, setUsdcRaw] = useState("")
  const [ngnRaw, setNgnRaw] = useState("")
  const [memo, setMemo] = useState("")

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

  const usdcAmount = quote ? BigInt(quote.amount) : null
  const overBalance = balance !== null && usdcAmount !== null && usdcAmount > balance

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
  function handleUsdcChange(raw: string) {
    let clean = raw.replace(/[^\d.]/g, "")
    const parts = clean.split(".")
    if (parts.length > 2) clean = parts[0] + "." + parts.slice(1).join("")
    if (parts[0]?.length > 9) clean = parts[0].slice(0, 9) + (parts[1] !== undefined ? "." + parts[1] : "")
    if (parts[1]?.length > 6) clean = parts[0] + "." + parts[1].slice(0, 6)
    setUsdcRaw(clean)
    setInputMode("usdc")
    setQuote(null)
    setQuoteError(null)

    if (!clean || clean === ".") { fetchLiveQuote(0n); return }
    const [whole = "0", frac = ""] = clean.split(".")
    const padded = frac.padEnd(6, "0")
    const units = BigInt(whole) * 1_000_000n + BigInt(padded)
    fetchLiveQuote(units)
  }

  function handleNgnChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 12)
    setNgnRaw(digits)
    setInputMode("ngn")
    setQuote(null)
    setQuoteError(null)

    if (!digits || digits === "0") { fetchLiveQuote(0n); return }
    const ngn = BigInt(digits)
    const rate = liveRate ?? 1600
    const usdcApprox = (ngn * 1_000_000n) / BigInt(rate)
    fetchLiveQuote(usdcApprox)
  }

  function handleSwap() {
    setInputMode(m => m === "usdc" ? "ngn" : "usdc")
    if (quote) {
      if (inputMode === "usdc") {
        setNgnRaw(BigInt(quote.ngnAmount).toString())
        setUsdcRaw("")
      } else {
        const u = BigInt(quote.amount)
        const whole = u / 1_000_000n
        const frac = (u % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "")
        setUsdcRaw(frac ? `${whole}.${frac}` : whole.toString())
        setNgnRaw("")
      }
    }
  }

  // ── derived display values ──
  const displayNgn = ngnRaw ? BigInt(ngnRaw).toLocaleString("en-NG") : ""

  const derivedUsdcDisplay: string = (() => {
    if (inputMode === "ngn" && quote) {
      const u = BigInt(quote.amount)
      const whole = u / 1_000_000n
      const frac = (u % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "")
      return frac ? `${whole}.${frac}` : whole.toString()
    }
    return ""
  })()

  const derivedNgnDisplay: string = (() => {
    if (inputMode === "usdc" && quote) {
      return BigInt(quote.ngnAmount).toLocaleString("en-NG")
    }
    return ""
  })()

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

  if (!authUser) return <div className="min-h-dvh bg-white" />

  // ══════════════════════════════════════════════════════════════════════════
  // DONE
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "done") {
    const tx = polledTx ?? receipt
    if (!tx) return <div className="min-h-dvh bg-white" />
    const usd = BigInt(tx.amount); const ngn = BigInt(tx.ngnAmount)
    const pending = !isTerminal(tx.status)
    const failed = tx.status === "blockchain_failed" || tx.status === "payout_failed" || tx.status === "cancelled"
    const iconBg = pending ? "bg-blue-50 ring-blue-50/50" : failed ? "bg-red-50 ring-red-50/50" : "bg-green-50 ring-green-50/50"
    const iconColor = pending ? "#2563eb" : failed ? "#dc2626" : "#16a34a"
    return (
      <Screen bare>
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-16 text-center">
          <div className={`flex h-20 w-20 items-center justify-center rounded-full ring-8 ${iconBg}`}>
            {pending ? <Spinner className="h-8 w-8 text-blue-600" />
              : failed
                ? <svg viewBox="0 0 32 32" width="36" height="36" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round"><path d="M8 8l16 16M24 8L8 24"/></svg>
                : <svg viewBox="0 0 32 32" width="36" height="36" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 16l8 8 12-14"/></svg>}
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-gray-900">
            {pending ? "Converting…" : failed ? "Conversion failed" : "Converted!"}
          </h1>
          {!failed && (
            <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 px-8 py-5 text-center">
              <p className="text-3xl font-bold tabular-nums text-gray-900">₦{ngn.toLocaleString("en-NG")}</p>
              <p className="mt-1 text-sm text-gray-400 tabular-nums">from {formatUSD(usd)} USDC</p>
            </div>
          )}
          <div className="mt-5 flex w-full max-w-sm items-center gap-3 rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm text-left">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{tx.recipientDisplayName}</p>
              {tx.recipientBankName && (
                <p className="text-xs text-gray-500 truncate">{tx.recipientBankName} · ****{tx.recipientAccountNumberLast4}</p>
              )}
              <div className="mt-1">
                <Badge variant={pending ? "blue" : failed ? "red" : "green"}>{statusLabel(tx.status)}</Badge>
              </div>
            </div>
          </div>
          {pending && <p className="mt-4 max-w-xs text-xs leading-relaxed text-gray-400">Naira is being sent to your bank account. This usually takes a few minutes.</p>}
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
      <Screen bare>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <Spinner className="h-7 w-7 text-blue-600" />
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-800">Converting to Naira…</p>
            <p className="mt-1 text-xs text-gray-400">Do not close this screen.</p>
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
          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{verifiedAccount.accountName}</p>
                <p className="text-xs text-gray-500">{verifiedAccount.bankName} · ****{verifiedAccount.accountNumber.slice(-4)}</p>
              </div>
              {quote && (
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums text-gray-900">₦{BigInt(quote.ngnAmount).toLocaleString("en-NG")}</p>
                  <p className="text-xs text-gray-400 tabular-nums">{formatUSD(usdcAmount)} USDC</p>
                </div>
              )}
            </div>
            {quote && (
              <div className="border-t border-gray-100">
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
              ? <p className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-400"><Spinner className="h-3 w-3" /> Processing…</p>
              : <p className="mt-3 text-xs text-gray-400">Your PIN securely authorises this conversion.</p>
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
          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {/* Recipient */}
            <div className="p-4">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Receiving account</p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{verifiedAccount.accountName}</p>
                  <p className="text-sm text-gray-500">{verifiedAccount.bankName} · ****{verifiedAccount.accountNumber.slice(-4)}</p>
                </div>
              </div>
            </div>

            {/* Quote breakdown */}
            <div className="border-t border-gray-100">
              {quoteLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-gray-400">
                  <Spinner className="h-4 w-4 text-blue-500" />Getting your rate…
                </div>
              ) : quoteError ? (
                <div className="px-4 py-4">
                  <p className="text-sm text-red-600">{quoteError}</p>
                  <button type="button" className="mt-2 text-xs font-semibold text-blue-600 underline"
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
            <p className="mt-2 text-center text-xs text-gray-400">
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
      <Screen back onBack={() => { setStep("bank_account"); setVerifiedAccount(null) }}>
        <div className="flex flex-1 flex-col pt-4 pb-10">
          <Title sub="Make sure this is your account.">Confirm account</Title>
          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-center py-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 ring-8 ring-green-50/60">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7"/>
                </svg>
              </div>
            </div>
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              <div className="flex justify-between px-5 py-3.5"><span className="text-sm text-gray-500">Bank</span><span className="text-sm font-semibold text-gray-900">{verifiedAccount.bankName}</span></div>
              <div className="flex justify-between px-5 py-3.5"><span className="text-sm text-gray-500">Account number</span><span className="text-sm font-semibold tabular-nums text-gray-900">****{verifiedAccount.accountNumber.slice(-4)}</span></div>
              <div className="flex justify-between bg-gray-50 px-5 py-4"><span className="text-sm text-gray-500">Account name</span><span className="text-sm font-bold uppercase tracking-wide text-gray-900">{verifiedAccount.accountName}</span></div>
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
      <Screen back onBack={() => { setStep("amount"); setSelectedBank(null); setBankSearch(""); setAccountNumber(""); setVerifyError(null) }}>
        <div className="flex flex-1 flex-col pt-4 pb-10">
          <Title sub="Enter the bank account where you want to receive naira.">Your bank account</Title>
          <div className="mt-6 space-y-4">
            {/* Bank selector */}
            <div ref={bankDropdownRef} className="relative">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Bank</label>
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
                  "flex h-12 cursor-pointer select-none items-center gap-2 rounded-xl border bg-white px-4 transition-colors focus:outline-none",
                  bankOpen ? "border-blue-500 ring-2 ring-blue-100" : "border-gray-200 hover:border-gray-300",
                ].join(" ")}
              >
                {bankOpen ? (
                  <input
                    value={bankSearch}
                    onChange={e => setBankSearch(e.target.value)}
                    placeholder="Search banks…"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                    className="min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400"
                  />
                ) : (
                  <span className={`flex-1 text-base ${selectedBank ? "text-gray-900 font-medium" : "text-gray-400"}`}>
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
                  className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                  {filteredBanks.length === 0
                    ? <li className="px-4 py-3 text-sm text-gray-400">No banks found.</li>
                    : filteredBanks.map((bank, i) => (
                      <li key={bank.code} role="option" aria-selected={selectedBank?.code === bank.code}
                        onMouseDown={e => { e.preventDefault(); setSelectedBank(bank); setBankSearch(""); setBankOpen(false); setVerifyError(null) }}
                        className={[
                          "flex cursor-pointer items-center px-4 py-3 text-sm transition hover:bg-blue-50",
                          selectedBank?.code === bank.code ? "bg-blue-50 font-semibold text-blue-700" : "text-gray-900",
                          i > 0 ? "border-t border-gray-100" : "",
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
                  : <span className="text-xs font-medium tabular-nums text-gray-400">{accountNumber.length}/10</span>
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
  // AMOUNT — professional dual-input with live rate
  // ══════════════════════════════════════════════════════════════════════════
  const hasInput = inputMode === "usdc" ? usdcRaw.length > 0 : ngnRaw.length > 0
  const canContinue = hasInput && !!quote && !quoteLoading && !overBalance

  return (
    <Screen back onBack={() => navigate("/home")}>
      <div className="flex flex-1 flex-col pt-4 pb-10">

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50">
              <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="#ea580c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3v14M6 6l4-3 4 3M6 14l4 3 4-3"/>
              </svg>
            </div>
            <h1 className="text-lg font-bold text-gray-900">Convert to Naira</h1>
          </div>
          <p className="text-sm text-gray-400 pl-[2.625rem]">Sell USDC and receive Naira directly to your bank.</p>
        </div>

        {/* Live rate pill */}
        <div className={`mb-4 flex items-center justify-between rounded-xl px-4 py-2.5 border ${rateError ? "border-red-100 bg-red-50" : "border-blue-100 bg-blue-50"}`}>
          <div className="flex items-center gap-2">
            <img src={getTokenLogo("USDC")} alt="USDC" className="h-4 w-4 rounded-full" />
            <span className={`text-xs font-semibold ${rateError ? "text-red-600" : "text-blue-700"}`}>Live rate</span>
          </div>
          {rateLoading ? (
            <span className="flex items-center gap-1.5 text-xs text-blue-500">
              <Spinner className="h-3 w-3" /> Fetching…
            </span>
          ) : rateError ? (
            <button onClick={retryRate} className="flex items-center gap-1.5 text-xs font-semibold text-red-600 underline">
              Failed · Retry
            </button>
          ) : (
            <span className="text-xs font-bold tabular-nums text-blue-700">
              $1 = ₦{liveRate?.toLocaleString() ?? "…"}
            </span>
          )}
        </div>

        {/* Conversion card */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">

          {/* USDC row */}
          <div className={`flex items-center gap-3 px-4 py-4 transition-colors ${inputMode === "usdc" ? "bg-blue-50/70" : "bg-white"}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-white shadow-sm">
              <img src={getTokenLogo("USDC")} alt="USDC" className="h-5 w-5 rounded-full" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">You sell</p>
              {inputMode === "usdc" ? (
                <input
                  value={usdcRaw}
                  onChange={e => handleUsdcChange(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  autoFocus={inputMode === "usdc"}
                  className="w-full bg-transparent text-2xl font-bold tabular-nums text-gray-900 outline-none placeholder:text-gray-200"
                />
              ) : (
                <p className="text-2xl font-bold tabular-nums text-gray-400 leading-none">
                  {quoteLoading
                    ? <span className="inline-block h-6 w-24 animate-pulse rounded-lg bg-gray-100 align-middle" />
                    : derivedUsdcDisplay || <span className="text-gray-200">0.00</span>}
                </p>
              )}
            </div>
            <span className="shrink-0 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500">USDC</span>
          </div>

          {/* Swap divider */}
          <div className="relative flex items-center justify-center border-y border-gray-100 bg-gray-50 py-1.5">
            <button
              type="button"
              onClick={handleSwap}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition hover:border-blue-300 hover:bg-blue-50 active:scale-90"
              aria-label="Swap input direction"
            >
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3v14M6 6l4-3 4 3M6 14l4 3 4-3"/>
              </svg>
            </button>
          </div>

          {/* NGN row */}
          <div className={`flex items-center gap-3 px-4 py-4 transition-colors ${inputMode === "ngn" ? "bg-orange-50/60" : "bg-white"}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-600 shadow-sm">
              <span className="text-sm font-bold text-white">₦</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">You receive</p>
              {inputMode === "ngn" ? (
                <input
                  value={displayNgn}
                  onChange={e => handleNgnChange(e.target.value)}
                  inputMode="numeric"
                  placeholder="0"
                  autoFocus={inputMode === "ngn"}
                  className="w-full bg-transparent text-2xl font-bold tabular-nums text-gray-900 outline-none placeholder:text-gray-200"
                />
              ) : (
                <p className="text-2xl font-bold tabular-nums text-gray-400 leading-none">
                  {quoteLoading
                    ? <span className="inline-block h-6 w-24 animate-pulse rounded-lg bg-gray-100 align-middle" />
                    : derivedNgnDisplay || <span className="text-gray-200">0</span>}
                </p>
              )}
            </div>
            <span className="shrink-0 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500">NGN</span>
          </div>
        </div>

        {/* Quote details */}
        {quote && !quoteError && (
          <div className="mt-3 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <span className="text-xs text-gray-500">Fee</span>
              <span className="text-xs font-semibold text-gray-700">
                {BigInt(quote.feeNgn) === 0n ? "Free 🎉" : `₦${BigInt(quote.feeNgn).toLocaleString()}`}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs font-semibold text-gray-600">You receive</span>
              <span className="text-sm font-bold tabular-nums text-blue-600">₦{BigInt(quote.ngnAmount).toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Errors & warnings */}
        <div className="mt-2 space-y-1.5">
          {overBalance && (
            <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#dc2626" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="7"/><path d="M8 5v3M8 10.5v.5"/>
              </svg>
              <p className="text-xs font-medium text-red-600">Exceeds your available USDC balance</p>
            </div>
          )}
          {quoteError && !quoteLoading && (
            <div className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50 px-4 py-2.5">
              <p className="text-xs text-red-600">{quoteError}</p>
              <button
                onClick={() => {
                  setQuoteError(null)
                  if (hasInput) {
                    if (inputMode === "usdc" && usdcRaw) handleUsdcChange(usdcRaw)
                    else if (inputMode === "ngn" && ngnRaw) handleNgnChange(ngnRaw)
                  }
                }}
                className="ml-2 shrink-0 text-xs font-semibold text-red-700 underline"
              >
                Retry
              </button>
            </div>
          )}
          {balance !== null && !overBalance && (
            <p className="text-center text-xs text-gray-300 tabular-nums">
              Available: {formatUSD(balance)} USDC
            </p>
          )}
        </div>

        {/* Memo + CTA */}
        <div className="mt-4 space-y-3">
          <Field
            value={memo}
            onChange={e => setMemo(e.target.value.slice(0, 60))}
            placeholder="Add a note (optional)"
            maxLength={60}
          />
          <Button
            full size="lg"
            disabled={!canContinue}
            loading={quoteLoading && hasInput}
            onClick={ensureFreshQuote}
          >
            {quoteLoading && hasInput ? "Getting rate…" : "Continue"}
          </Button>
        </div>
      </div>
    </Screen>
  )
}

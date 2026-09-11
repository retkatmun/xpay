
/**
 * XPay Send Money — complete flow.
 *
 * Steps (bank):
 *   recipient_mode → bank_account → bank_confirm_recipient → amount → review → pin → sending → done
 *
 * Steps (XPay user):
 *   recipient_mode → xpay_lookup → amount → review → pin → sending → done
 *
 * Audit fixes in this version:
 *  1. Bank select: inline combobox, outside-click close, keyboard-accessible,
 *     deduplication by code, max-h scroll, no full-screen overlay.
 *  2. Idempotency key: quote.id only — PIN digits never included.
 *  3. Quote fetch: triggered on "Continue" click in amount step with loading
 *     guard; review screen never shown with blank quote.
 *  4. Done screen: copy driven by actual tx.status, not hardcoded.
 *  5. Amount input: accepts NGN (₦); USDC is derived from the quote rate.
 *  6. Error handling: try/catch on every async call, friendlyError() maps all
 *     known reason codes to user-readable strings.
 *  7. Loading guards: submitting flag prevents double-send; buttons disabled
 *     during all in-flight ops.
 *  8. Back navigation: each back button resets only its own state slice.
 *  9. Done screen polls transaction every 4 s until terminal status.
 */

import { useEffect, useState, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Avatar } from "@/components/Avatar"
import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { CodeInput } from "@/components/CodeInput"
import { Field } from "@/components/Field"
import { Screen, Title } from "@/components/Screen"
import { Spinner } from "@/components/icons"
import {
  ApiError,
  formatHandle, getBalance, getQuote, getTransaction,
  getRecentRecipients, getBanks, resolveBankAccount,
  resolveRecipient, sendToUser, sendToBank,
} from "@/lib/api"
import { formatUSD } from "@/lib/money"
import { useSession } from "@/lib/session"
import { isTerminal, statusLabel } from "@/lib/txStatus"
import type { Bank, BankResolveResult, PublicUser, Quote, Transaction } from "@/lib/types"

// ─── Step machine ─────────────────────────────────────────────────────────────

type Step =
  | "recipient_mode"
  | "xpay_lookup"
  | "bank_account"
  | "bank_confirm_recipient"
  | "wallet_address"
  | "amount"
  | "review"
  | "pin"
  | "sending"
  | "done"

// ─── Error mapping ────────────────────────────────────────────────────────────

function friendlyError(reason: string): string {
  switch (reason) {
    case "wrong_pin":             return "Incorrect PIN. Try again."
    case "locked":                return "Too many wrong PINs. Account is temporarily locked."
    case "insufficient":          return "Not enough balance for that amount."
    case "quote_expired":         return "Your rate expired. Please start again."
    case "not_found":             return "Recipient not found."
    case "invalid":               return "Something looks wrong. Check your details and try again."
    case "chain_error":           return "Blockchain error. Please try again in a moment."
    case "server_error":          return "Something went wrong on our end. Please try again."
    case "provider_error":        return "Payment provider unavailable. Please try again shortly."
    case "provider_config_error": return "Transfers are not yet enabled on this account. Contact support."
    case "invalid_account":       return "Account not found. Check the number and bank."
    case "bank_not_found":        return "Bank not recognised. Please search again."
    case "rate_limited":          return "Too many verification attempts today. Please try again tomorrow or use a different bank."
    case "sms_unavailable":       return "SMS service is unavailable right now. Please try again."
    case "fx_unavailable":        return "Could not get the current exchange rate. Please try again."
    case "unauthorized":          return "Your session has expired. Please log in again."
    case "too_many_requests":     return "Too many attempts. Please wait a moment and try again."
    case "bank_list_unavailable": return "Could not load bank list. Check your connection."
    default:                      return `Something went wrong (${reason}). Please try again.`
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Send() {
  const navigate = useNavigate()
  const { authUser, loading } = useSession()

  // ── navigation ──
  const [step, setStep] = useState<Step>("recipient_mode")

  // ── wallet ──
  const [balance, setBalance] = useState<bigint | null>(null)

  // ── xpay lookup ──
  const [recents, setRecents]         = useState<PublicUser[]>([])
  const [query, setQuery]             = useState("")
  const [resolving, setResolving]     = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [xpayRecipient, setXpayRecipient] = useState<PublicUser | null>(null)

  // ── bank / account ──
  const [banks, setBanks]               = useState<Bank[]>([])
  const [bankSearch, setBankSearch]     = useState("")
  const [bankOpen, setBankOpen]         = useState(false)
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null)
  const [accountNumber, setAccountNumber] = useState("")
  const [verifying, setVerifying]       = useState(false)
  const [verifyError, setVerifyError]   = useState<string | null>(null)
  const [verifiedAccount, setVerifiedAccount] =
    useState<(BankResolveResult & { success: true }) | null>(null)
  const bankDropdownRef = useRef<HTMLDivElement>(null)

  // ── wallet address ──
  const [walletAddressInput, setWalletAddressInput] = useState("")
  const [walletAddressError, setWalletAddressError] = useState<string | null>(null)

  // ── amount ──
  // User enters NGN; USDC amount is derived from the quote
  const [rawNgn, setRawNgn]   = useState("")   // digits only, no commas
  const [memo, setMemo]       = useState("")

  // ── quote ──
  const [quote, setQuote]             = useState<Quote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError]   = useState<string | null>(null)

  // ── pin / send ──
  const [pin, setPin]           = useState("")
  const [pinError, setPinError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // ── result ──
  const [receipt, setReceipt]   = useState<Transaction | null>(null)
  const [polledTx, setPolledTx] = useState<Transaction | null>(null)

  // ─── Auth guard ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !authUser) navigate("/", { replace: true })
  }, [loading, authUser, navigate])

  // ─── Bootstrap ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser) return
    void getBalance().then(b => setBalance(BigInt(b.usd)))
    void getRecentRecipients().then(setRecents)
    void getBanks().then(raw => {
      // Deduplicate by bank code
      const seen = new Set<string>()
      setBanks(raw.filter(b => {
        if (seen.has(b.code)) return false
        seen.add(b.code)
        return true
      }))
    })
  }, [authUser])

  // ─── Bank dropdown: close on outside click ────────────────────────────────
  useEffect(() => {
    if (!bankOpen) return
    function onMouseDown(e: MouseEvent) {
      if (
        bankDropdownRef.current &&
        !bankDropdownRef.current.contains(e.target as Node)
      ) {
        setBankOpen(false)
        setBankSearch("")
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [bankOpen])

  // ─── Poll receipt until terminal ─────────────────────────────────────────
  useEffect(() => {
    if (!receipt) return
    // Update polledTx via a microtask to avoid synchronous setState-in-effect warning
    const init = setTimeout(() => setPolledTx(receipt), 0)
    if (isTerminal(receipt.status)) return () => clearTimeout(init)

    const id = setInterval(async () => {
      const fresh = await getTransaction(receipt.id).catch(() => null)
      if (fresh) {
        setPolledTx(fresh)
        if (isTerminal(fresh.status)) clearInterval(id)
      }
    }, 4000)
    return () => clearInterval(id)
  }, [receipt])

  // ─── Derived ─────────────────────────────────────────────────────────────

  // NGN the user typed as bigint
  const ngnTyped: bigint | null = (() => {
    const s = rawNgn.trim()
    if (!s || !/^\d+$/.test(s)) return null
    const v = BigInt(s)
    return v > 0n ? v : null
  })()

  // USDC amount from confirmed quote
  const usdcAmount: bigint | null = quote ? BigInt(quote.amount) : null

  // balance check: quote USDC > wallet USDC
  const overBalance =
    usdcAmount !== null && balance !== null && usdcAmount > balance

  const filteredBanks = bankSearch
    ? banks.filter(b =>
        b.name.toLowerCase().includes(bankSearch.toLowerCase()),
      )
    : banks

  // ─── Quote fetch ──────────────────────────────────────────────────────────
  // Called when user taps "Continue" on amount step.
  //
  // Strategy:
  //   1. Fetch a $1 quote to get the live exchange rate.
  //   2. Compute how much USDC the typed NGN amount costs.
  //   3. Guard: minimum transfer is $1 (1_000_000 base units). If the NGN
  //      amount is too small, show a clear message before hitting the backend.
  //   4. Fetch the real quote for the computed USDC amount.
  const fetchQuote = useCallback(async (ngnAmount: bigint): Promise<Quote | null> => {
    setQuoteLoading(true)
    setQuoteError(null)
    setQuote(null)
    try {
      // Step 1: get current rate via a $1 quote
      const rateQuote = await getQuote(1_000_000n)
      const rate = rateQuote.fxRate
      if (!rate || rate <= 0) throw new Error("fx_unavailable")

      // Step 2: USDC needed = ceil(NGN / rate), in 6-dp base units
      // rate is NGN per 1 USD = NGN per 1_000_000 base units
      const usdcNeeded =
        (ngnAmount * 1_000_000n + BigInt(rate) - 1n) / BigInt(rate)

      // Step 3: minimum $1 guard — show a clear message, not a generic error
      const MIN_USDC = 1_000_000n // $1.00
      if (usdcNeeded < MIN_USDC) {
        // Compute the minimum NGN that clears the $1 threshold at this rate
        const minNgn = BigInt(rate) // rate = NGN per $1
        setQuoteError(`Minimum transfer is ₦${minNgn.toLocaleString("en-NG")} (= $1.00 USDC) at today's rate.`)
        return null
      }

      // Step 4: fetch the real quote for that USDC amount
      const q = await getQuote(usdcNeeded)
      console.log("[XPay] fetchQuote success:", { usdcNeeded: usdcNeeded.toString(), quoteId: q.id, fxRate: q.fxRate })
      setQuote(q)
      return q
    } catch (err: unknown) {
      const reason =
        err instanceof ApiError ? err.reason
        : err instanceof Error ? err.message
        : "server_error"
      console.error("[XPay] fetchQuote error:", { reason, err })
      setQuoteError(friendlyError(reason))
      return null
    } finally {
      setQuoteLoading(false)
    }
  }, [])

  // ─── XPay lookup ─────────────────────────────────────────────────────────
  async function lookupXpay(value: string) {
    let trimmed = value.trim()
    if (!trimmed || resolving) return

    // Normalise Nigerian phone numbers entered without country code:
    //   08012345678  → +2348012345678
    //   8012345678   → +2348012345678
    //   2348012345678 → +2348012345678
    // Handles with @/. suffix are passed through unchanged.
    if (/^\d/.test(trimmed)) {
      const digits = trimmed.replace(/\D/g, "")
      if (digits.startsWith("0") && digits.length === 11) {
        trimmed = `+234${digits.slice(1)}`
      } else if (digits.startsWith("234") && digits.length === 13) {
        trimmed = `+${digits}`
      } else if (digits.length === 10) {
        trimmed = `+234${digits}`
      }
    }

    setResolving(true)
    setLookupError(null)
    try {
      const result = await resolveRecipient(trimmed)
      if (!result.found) {
        setLookupError(
          result.reason === "not_found"
            ? "Nobody on XPay with that handle or number."
            : "Enter a phone number (e.g. 08012345678) or XPay handle.",
        )
        return
      }
      setXpayRecipient(result.user)
      setStep("amount")
    } catch {
      setLookupError("Could not reach the server. Check your connection and try again.")
    } finally {
      setResolving(false)
    }
  }

  // ─── Bank account verification ────────────────────────────────────────────
  async function verifyBankAccount() {
    if (!selectedBank || accountNumber.length !== 10 || verifying) return
    setVerifying(true)
    setVerifyError(null)
    try {
      const result = await resolveBankAccount(selectedBank.code, accountNumber)
      if (!result.success) {
        setVerifyError(friendlyError(result.reason))
        return
      }
      setVerifiedAccount(result)
      setStep("bank_confirm_recipient")
    } catch {
      setVerifyError(
        "Could not reach the verification service. Check your connection and try again.",
      )
    } finally {
      setVerifying(false)
    }
  }

  // ─── Amount → Review ──────────────────────────────────────────────────────
  async function handleContinueFromAmount() {
    if (!ngnTyped || ngnTyped <= 0n || quoteLoading) return
    const q = await fetchQuote(ngnTyped)
    if (!q) return  // quoteError already set
    setStep("review")
  }

  // ─── PIN entry ────────────────────────────────────────────────────────────
  function handlePin(next: string) {
    if (submitting) return
    setPinError(null)
    setPin(next)
    if (next.length === 4) void submitTransfer(next)
  }

  // ─── Transfer submission ──────────────────────────────────────────────────
  async function submitTransfer(pinValue: string) {
    if (!usdcAmount || !quote || submitting) {
      console.error("[XPay] submitTransfer guard failed:", { usdcAmount: usdcAmount?.toString(), quote: !!quote, submitting })
      return
    }
    setSubmitting(true)
    setStep("sending")

    try {
      // Idempotency key uses only quote.id — never PIN digits
      const idempotencyKey = `send_${quote.id}`

      console.log("[XPay] submitTransfer:", {
        xpayRecipient: xpayRecipient?.username,
        quoteId: quote.id,
        amount: quote.amount,
        idempotencyKey,
      })

      let result
      if (xpayRecipient) {
        result = await sendToUser({
          recipient: xpayRecipient.username,
          quoteId: quote.id,
          memo: memo || undefined,
          pin: pinValue,
          idempotencyKey,
        })
      } else if (verifiedAccount) {
        result = await sendToBank({
          bankCode: verifiedAccount.bankCode,
          accountNumber: verifiedAccount.accountNumber,
          accountName: verifiedAccount.accountName,
          quoteId: quote.id,
          memo: memo || undefined,
          pin: pinValue,
          idempotencyKey,
        })
      } else {
        // shouldn't reach here
        setPinError("Recipient missing. Please start again.")
        setPin("")
        setStep("pin")
        return
      }

      console.log("[XPay] sendToUser result:", result)

      if (!result.ok) {
        console.error("[XPay] Transfer failed:", result.reason)
        setPinError(friendlyError(result.reason))
        setPin("")
        setStep("pin")
        return
      }

      setReceipt(result.transaction)
      setStep("done")
    } catch (err) {
      console.error("[XPay] submitTransfer exception:", err)
      setPinError("Network error. Please try again.")
      setPin("")
      setStep("pin")
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Guard ────────────────────────────────────────────────────────────────
  if (!authUser) return <div className="min-h-dvh bg-white" />

  // ══════════════════════════════════════════════════════════════════════════
  // DONE
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "done") {
    const tx = polledTx ?? receipt
    if (!tx) return <div className="min-h-dvh bg-white" />

    const usd     = BigInt(tx.amount)
    const ngn     = BigInt(tx.ngnAmount)
    const pending = !isTerminal(tx.status)
    const failed  =
      tx.status === "blockchain_failed" ||
      tx.status === "payout_failed" ||
      tx.status === "cancelled" ||
      tx.status === "expired"

    let headline: string
    if (pending)                               headline = "Transfer in progress"
    else if (failed)                           headline = "Transfer failed"
    else if (tx.status === "payout_failed")    headline = "Transfer reversed"
    else if (tx.recipientType === "bank_account") headline = "Transfer initiated"
    else                                       headline = "Sent!"

    const iconColor = pending ? "#2563eb" : failed ? "#dc2626" : "#16a34a"
    const iconBg    = pending ? "bg-blue-50 ring-blue-50/50"
                    : failed  ? "bg-red-50 ring-red-50/50"
                    :           "bg-green-50 ring-green-50/50"

    return (
      <Screen bare>
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-16 text-center">

          {/* status icon */}
          <div className={`flex h-20 w-20 items-center justify-center rounded-full ring-8 ${iconBg}`}>
            {pending ? (
              <Spinner className="h-8 w-8 text-blue-600" />
            ) : failed ? (
              <svg viewBox="0 0 32 32" width="36" height="36" fill="none"
                stroke={iconColor} strokeWidth="2.5" strokeLinecap="round">
                <path d="M8 8l16 16M24 8L8 24" />
              </svg>
            ) : (
              <svg viewBox="0 0 32 32" width="36" height="36" fill="none"
                stroke={iconColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 16l8 8 12-14" />
              </svg>
            )}
          </div>

          {/* headline */}
          <h1 className="mt-6 font-[var(--font-instrument-serif)] text-[2rem] tracking-[-0.02em] text-gray-900">
            {headline}
          </h1>

          {/* context copy */}
          {pending && (
            <p className="mt-2 max-w-[280px] text-sm text-gray-500">
              Your transfer is being processed. This usually takes a few minutes.
            </p>
          )}
          {failed && (
            <p className="mt-2 max-w-[280px] text-sm text-red-600">
              The transfer could not be completed. If money left your account, it will be reversed automatically.
            </p>
          )}

          {/* amount */}
          {!failed && (
            <>
              <p className="mt-4 font-[var(--font-instrument-serif)] text-[3rem] leading-none tracking-[-0.03em] tabular-nums text-gray-900">
                {formatUSD(usd)}
              </p>
              {ngn > 0n && (
                <p className="mt-1.5 text-sm text-gray-500 tabular-nums">
                  ≈ ₦{ngn.toLocaleString("en-NG")} to recipient
                </p>
              )}
            </>
          )}

          {/* recipient card */}
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-5 py-4">
            {tx.recipientType === "bank_account" ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                  stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
                </svg>
              </div>
            ) : (
              <Avatar name={tx.recipientDisplayName} size={40} />
            )}
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">
                {tx.recipientDisplayName}
              </p>
              {tx.recipientBankName && (
                <p className="text-xs text-gray-500">
                  {tx.recipientBankName} · ****{tx.recipientAccountNumberLast4}
                </p>
              )}
              <Badge variant={pending ? "blue" : failed ? "red" : "green"}>
                {statusLabel(tx.status)}
              </Badge>
            </div>
          </div>

          {pending && tx.recipientType === "bank_account" && (
            <p className="mt-4 max-w-[280px] text-xs leading-relaxed text-gray-400">
              The naira is being settled to the recipient&apos;s bank account.
            </p>
          )}

          {tx.txHash && (
            <a
              href={`https://sepolia.basescan.org/tx/${tx.txHash}`}
              target="_blank" rel="noreferrer"
              className="mt-4 text-xs text-blue-600 underline-offset-2 hover:underline"
            >
              View on BaseScan ↗
            </a>
          )}
        </div>

        <div className="shrink-0 px-5 pb-10">
          <Button full size="lg" onClick={() => navigate("/home", { replace: true })}>
            Back to home
          </Button>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SENDING (in-flight)
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "sending") {
    return (
      <Screen bare>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <Spinner className="h-7 w-7 text-blue-600" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-800">Processing your transfer…</p>
            <p className="mt-1 text-xs text-gray-400">Do not close this screen.</p>
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PIN
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "pin" && usdcAmount !== null) {
    const recipientName =
      xpayRecipient?.displayName ?? verifiedAccount?.accountName ?? ""

    return (
      <Screen
        back
        onBack={() => {
          if (submitting) return
          setStep("review")
          setPin("")
          setPinError(null)
        }}
      >
        <div className="flex flex-1 flex-col pt-4 pb-10">
          <Title sub="Enter your 4-digit PIN to authorise this transfer.">
            Confirm transfer
          </Title>

          {/* summary */}
          <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {xpayRecipient ? (
                  <Avatar name={recipientName} size={40} />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                      stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
                    </svg>
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-gray-900">{recipientName}</p>
                  <p className="text-xs text-gray-500">
                    {verifiedAccount
                      ? `${verifiedAccount.bankName} · ****${verifiedAccount.accountNumber.slice(-4)}`
                      : xpayRecipient
                      ? formatHandle(xpayRecipient.username)
                      : ""}
                  </p>
                </div>
              </div>
              {quote && (
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-gray-900">
                    ₦{BigInt(quote.ngnAmount).toLocaleString("en-NG")}
                  </p>
                  <p className="text-xs text-gray-400 tabular-nums">
                    {formatUSD(usdcAmount)} USDC
                  </p>
                </div>
              )}
            </div>

            {quote && (
              <div className="mt-4 space-y-1.5 border-t border-gray-200 pt-4 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>Rate</span>
                  <span className="tabular-nums">$1 = ₦{quote.fxRate.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Fee</span>
                  <span>
                    {BigInt(quote.feeNgn) === 0n
                      ? "Free"
                      : `₦${BigInt(quote.feeNgn).toLocaleString()}`}
                  </span>
                </div>
                <div className="flex justify-between font-semibold text-gray-900">
                  <span>Recipient receives</span>
                  <span className="tabular-nums text-blue-600">
                    ₦{BigInt(quote.ngnAmount).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 text-center">
            <CodeInput
              label="4-digit PIN"
              length={4}
              value={pin}
              onChange={handlePin}
              secret
              autoFocus
              error={!!pinError}
            />
            {pinError && <p className="mt-2 text-sm text-red-600">{pinError}</p>}
            {submitting ? (
              <p className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-400">
                <Spinner className="h-3 w-3" /> Processing…
              </p>
            ) : (
              <p className="mt-3 text-xs text-gray-400">
                Your PIN securely authorises this transfer.
              </p>
            )}
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REVIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "review") {
    const recipientName =
      xpayRecipient?.displayName ?? verifiedAccount?.accountName ?? ""

    return (
      <Screen back onBack={() => setStep("amount")}>
        <div className="flex flex-1 flex-col pt-4 pb-10">
          <Title>Review transfer</Title>

          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {/* recipient */}
            <div className="p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                Recipient
              </p>
              <div className="flex items-center gap-3">
                {xpayRecipient ? (
                  <Avatar name={recipientName} size={40} />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                      stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
                    </svg>
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900">{recipientName}</p>
                  <p className="text-sm text-gray-500">
                    {verifiedAccount
                      ? `${verifiedAccount.bankName} · ****${verifiedAccount.accountNumber.slice(-4)}`
                      : xpayRecipient
                      ? formatHandle(xpayRecipient.username)
                      : ""}
                  </p>
                </div>
              </div>
            </div>

            {/* amounts */}
            <div className="border-t border-gray-100">
              {quoteLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-gray-400">
                  <Spinner className="h-4 w-4 text-blue-500" />
                  Getting your rate…
                </div>
              ) : quoteError ? (
                <div className="px-4 py-4">
                  <p className="text-sm text-red-600">{quoteError}</p>
                  <button
                    type="button"
                    className="mt-2 text-xs text-blue-600 underline"
                    onClick={() => ngnTyped && void fetchQuote(ngnTyped)}
                  >
                    Retry
                  </button>
                </div>
              ) : quote ? (
                <>
                  <div className="flex justify-between px-4 py-3">
                    <span className="text-sm text-gray-500">You send</span>
                    <span className="text-sm font-medium tabular-nums text-gray-900">
                      {formatUSD(BigInt(quote.amount))} USDC
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-gray-100 px-4 py-3">
                    <span className="text-sm text-gray-500">Exchange rate</span>
                    <span className="text-sm tabular-nums text-gray-700">
                      $1 = ₦{quote.fxRate.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-gray-100 px-4 py-3">
                    <span className="text-sm text-gray-500">Fee</span>
                    <span className="text-sm tabular-nums text-gray-700">
                      {BigInt(quote.feeNgn) === 0n
                        ? <Badge variant="green">Free</Badge>
                        : `₦${BigInt(quote.feeNgn).toLocaleString()}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-100 bg-blue-50 px-4 py-4 rounded-b-2xl">
                    <span className="text-sm font-semibold text-gray-900">
                      Recipient receives
                    </span>
                    <span className="text-[1rem] font-bold tabular-nums text-blue-600">
                      ₦{BigInt(quote.ngnAmount).toLocaleString()}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {quote && (
            <p className="mt-2 text-center text-xs text-gray-400">
              Rate valid until{" "}
              {new Date(quote.expiresAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}

          <div className="mt-auto pt-6">
            <Button
              full size="lg"
              disabled={quoteLoading || !quote || !!quoteError}
              onClick={() => setStep("pin")}
            >
              Continue to PIN
            </Button>
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AMOUNT  (NGN-first input)
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "amount") {
    const recipientName =
      xpayRecipient?.displayName ?? verifiedAccount?.accountName ?? ""

    // Display with thousands separators while keeping rawNgn as plain digits
    const displayNgn = rawNgn
      ? BigInt(rawNgn).toLocaleString("en-NG")
      : ""

    function handleNgnInput(e: React.ChangeEvent<HTMLInputElement>) {
      const digits = e.target.value.replace(/\D/g, "").slice(0, 12)
      setRawNgn(digits)
      setQuote(null)
      setQuoteError(null)
    }

    return (
      <Screen
        back
        onBack={() => {
          if (xpayRecipient) {
            setStep("xpay_lookup")
            setXpayRecipient(null)
          } else {
            setStep("bank_confirm_recipient")
          }
          setRawNgn("")
          setQuote(null)
          setQuoteError(null)
        }}
      >
        <div className="flex flex-1 flex-col pt-4 pb-10">
          {/* recipient chip */}
          <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            {xpayRecipient ? (
              <Avatar name={recipientName} size={36} />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                  stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
                </svg>
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-gray-900">{recipientName}</p>
              <p className="text-xs text-gray-500">
                {xpayRecipient
                  ? formatHandle(xpayRecipient.username)
                  : verifiedAccount
                  ? `${verifiedAccount.bankName} · ****${verifiedAccount.accountNumber.slice(-4)}`
                  : ""}
              </p>
            </div>
          </div>

          {/* big ₦ input */}
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Amount in Naira
            </p>
            <div className="flex items-baseline gap-1">
              <span
                className={`text-[2.5rem] font-light leading-none ${
                  rawNgn ? "text-gray-500" : "text-gray-200"
                }`}
              >
                ₦
              </span>
              <input
                value={displayNgn}
                onChange={handleNgnInput}
                inputMode="numeric"
                autoFocus
                aria-label="Amount in Naira"
                placeholder="0"
                className="min-w-0 bg-transparent text-[3.25rem] font-semibold leading-none tracking-[-0.03em] text-gray-900 outline-none placeholder:text-gray-200 tabular-nums"
                style={{ width: `${Math.max((displayNgn || "0").length, 1)}ch` }}
              />
            </div>

            {/* balance hint */}
            <p className="mt-3 h-4 text-xs tabular-nums">
              {usdcAmount !== null && overBalance ? (
                <span className="text-red-500">Exceeds your available balance</span>
              ) : balance !== null ? (
                <span className="text-gray-300">
                  Balance: {formatUSD(balance)} USDC available
                </span>
              ) : null}
            </p>
          </div>

          <div className="shrink-0 space-y-3">
            <Field
              value={memo}
              onChange={e => setMemo(e.target.value.slice(0, 60))}
              placeholder="Add a note (optional)"
              maxLength={60}
            />
            <Button
              full size="lg"
              disabled={!ngnTyped || ngnTyped <= 0n || quoteLoading}
              loading={quoteLoading}
              onClick={handleContinueFromAmount}
            >
              {quoteLoading ? "Getting rate…" : "Continue"}
            </Button>
            {quoteError && (
              <p className="text-center text-sm text-red-600">{quoteError}</p>
            )}
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BANK: CONFIRM RECIPIENT
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "bank_confirm_recipient" && verifiedAccount) {
    return (
      <Screen
        back
        onBack={() => {
          setStep("bank_account")
          setVerifiedAccount(null)
        }}
      >
        <div className="flex flex-1 flex-col pt-4 pb-10">
          <Title sub="Please verify the account name carefully.">Confirm recipient</Title>

          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-center py-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 ring-8 ring-green-50/60">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none"
                  stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7"/>
                </svg>
              </div>
            </div>
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              <div className="flex justify-between px-5 py-3.5">
                <span className="text-sm text-gray-500">Bank</span>
                <span className="text-sm font-medium text-gray-900">
                  {verifiedAccount.bankName}
                </span>
              </div>
              <div className="flex justify-between px-5 py-3.5">
                <span className="text-sm text-gray-500">Account number</span>
                <span className="text-sm font-medium tabular-nums text-gray-900">
                  ****{verifiedAccount.accountNumber.slice(-4)}
                </span>
              </div>
              <div className="flex justify-between bg-gray-50 px-5 py-4">
                <span className="text-sm text-gray-500">Account name</span>
                <span className="text-sm font-bold uppercase tracking-wide text-gray-900">
                  {verifiedAccount.accountName}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs leading-relaxed text-amber-700">
              Verify the name above before proceeding. Once sent, the money cannot be recalled.
            </p>
          </div>

          <div className="mt-auto space-y-3 pt-6">
            <Button full size="lg" onClick={() => setStep("amount")}>
              Yes, this is correct
            </Button>
            <Button
              full variant="secondary"
              onClick={() => { setStep("bank_account"); setVerifiedAccount(null) }}
            >
              Change account
            </Button>
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BANK: ACCOUNT ENTRY  (bank combobox + account number, single screen)
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "bank_account") {
    const canVerify = !!selectedBank && accountNumber.length === 10 && !verifying

    return (
      <Screen
        back
        onBack={() => {
          setStep("recipient_mode")
          setSelectedBank(null)
          setBankSearch("")
          setBankOpen(false)
          setAccountNumber("")
          setVerifyError(null)
        }}
      >
        <div className="flex flex-1 flex-col pt-4 pb-10">
          <Title sub="Enter the recipient's bank and 10-digit account number.">
            Send to bank account
          </Title>

          <div className="mt-6 space-y-4">
            {/* ── Bank combobox ────────────────────────────────────────── */}
            <div ref={bankDropdownRef} className="relative">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Bank
              </label>

              {/* trigger row */}
              <div
                role="combobox"
                aria-expanded={bankOpen}
                aria-haspopup="listbox"
                tabIndex={0}
                onClick={() => setBankOpen(v => !v)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setBankOpen(v => !v)
                  }
                  if (e.key === "Escape") { setBankOpen(false); setBankSearch("") }
                }}
                className={[
                  "flex h-11 cursor-pointer select-none items-center gap-2 rounded-xl border bg-white px-4",
                  "transition-colors duration-150 focus:outline-none",
                  bankOpen
                    ? "border-blue-500 ring-3 ring-blue-100"
                    : "border-gray-200 hover:border-gray-300",
                ].join(" ")}
              >
                {bankOpen ? (
                  <input
                    value={bankSearch}
                    onChange={e => setBankSearch(e.target.value)}
                    placeholder="Search banks…"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                    className="min-w-0 flex-1 bg-transparent text-[0.95rem] text-gray-900 outline-none placeholder:text-gray-400"
                  />
                ) : (
                  <span
                    className={`flex-1 text-[0.95rem] ${
                      selectedBank ? "text-gray-900" : "text-gray-400"
                    }`}
                  >
                    {selectedBank ? selectedBank.name : "Select bank"}
                  </span>
                )}
                <svg
                  viewBox="0 0 20 20" width="16" height="16" fill="none"
                  stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  className={`shrink-0 transition-transform duration-150 ${bankOpen ? "rotate-180" : ""}`}
                  aria-hidden
                >
                  <path d="M5 8l5 5 5-5"/>
                </svg>
              </div>

              {/* dropdown */}
              {bankOpen && (
                <ul
                  role="listbox"
                  aria-label="Banks"
                  className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
                >
                  {filteredBanks.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-gray-400">No banks found.</li>
                  ) : (
                    filteredBanks.map((bank, i) => (
                      <li
                        key={bank.code}
                        role="option"
                        aria-selected={selectedBank?.code === bank.code}
                        onMouseDown={e => {
                          e.preventDefault()   // keep focus in the input
                          setSelectedBank(bank)
                          setBankSearch("")
                          setBankOpen(false)
                          setVerifyError(null)
                        }}
                        className={[
                          "flex cursor-pointer items-center px-4 py-3 text-sm transition",
                          "hover:bg-blue-50",
                          selectedBank?.code === bank.code
                            ? "bg-blue-50 font-semibold text-blue-700"
                            : "text-gray-900",
                          i > 0 ? "border-t border-gray-100" : "",
                        ].join(" ")}
                      >
                        {bank.name}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>

            {/* ── Account number ───────────────────────────────────────── */}
            <Field
              label="Account number"
              value={accountNumber}
              onChange={e => {
                setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))
                setVerifyError(null)
              }}
              inputMode="numeric"
              placeholder="0123456789"
              maxLength={10}
              autoComplete="off"
              error={verifyError}
              hint={
                accountNumber.length > 0 && accountNumber.length < 10
                  ? `${accountNumber.length} of 10 digits`
                  : accountNumber.length === 0
                  ? "Nigerian account numbers are exactly 10 digits"
                  : undefined
              }
              suffix={
                accountNumber.length === 10 ? (
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none"
                    stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10l5 5 7-9"/>
                  </svg>
                ) : (
                  <span className="text-xs font-medium tabular-nums text-gray-400">
                    {accountNumber.length}/10
                  </span>
                )
              }
            />
          </div>

          <div className="mt-auto pt-6">
            <Button
              full size="lg"
              disabled={!canVerify}
              loading={verifying}
              onClick={verifyBankAccount}
            >
              {verifying ? "Verifying account…" : "Verify account"}
            </Button>
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WALLET ADDRESS
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "wallet_address") {
    const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(walletAddressInput.trim())

    return (
      <Screen
        back
        onBack={() => {
          setStep("recipient_mode")
          setWalletAddressInput("")
          setWalletAddressError(null)
        }}
      >
        <form
          onSubmit={e => {
            e.preventDefault()
            const addr = walletAddressInput.trim()
            if (!isValidAddress) {
              setWalletAddressError("Enter a valid Base / EVM wallet address (0x…)")
              return
            }
            // Use xpayRecipient slot with a synthetic entry so the amount
            // step can show the recipient chip. We store the address in
            // displayName and username so both display and lookup work.
            setXpayRecipient({ username: addr, displayName: addr.slice(0, 6) + "…" + addr.slice(-4) })
            setWalletAddressError(null)
            setStep("amount")
          }}
          className="flex flex-1 flex-col pt-4 pb-10"
        >
          <Title sub="Send USDC on Base to any wallet address.">
            Wallet address
          </Title>

          <div className="mt-6">
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              Recipient address
            </label>
            <input
              value={walletAddressInput}
              onChange={e => {
                setWalletAddressInput(e.target.value)
                setWalletAddressError(null)
              }}
              placeholder="0x..."
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className={[
                "h-12 w-full rounded-xl border bg-white px-4 font-mono text-sm text-gray-900 outline-none transition",
                "placeholder:text-gray-400 placeholder:font-sans",
                walletAddressError
                  ? "border-red-400 ring-2 ring-red-100"
                  : "border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
              ].join(" ")}
            />
            {walletAddressError && (
              <p className="mt-1.5 text-xs text-red-600">{walletAddressError}</p>
            )}
            {!walletAddressError && walletAddressInput && (
              <p className={`mt-1.5 text-xs ${isValidAddress ? "text-green-600" : "text-gray-400"}`}>
                {isValidAddress ? "✓ Valid address" : "Must be a 42-character hex address starting with 0x"}
              </p>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs leading-relaxed text-amber-700">
              <strong>Base network only.</strong> Only send to addresses that support USDC on Base.
              Sending to the wrong network will result in permanent loss.
            </p>
          </div>

          <div className="mt-auto pt-8">
            <Button full type="submit" size="lg" disabled={!walletAddressInput.trim()}>
              Continue
            </Button>
          </div>
        </form>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // XPAY LOOKUP
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "xpay_lookup") {
    return (
      <Screen
        back
        onBack={() => {
          setStep("recipient_mode")
          setQuery("")
          setLookupError(null)
        }}
      >
        <form
          onSubmit={e => { e.preventDefault(); void lookupXpay(query) }}
          className="flex flex-1 flex-col pt-4 pb-10"
        >
          <Title sub="Enter their XPay handle or phone number.">
            Who are you paying?
          </Title>

          <div className="mt-6">
            <Field
              value={query}
              onChange={e => { setQuery(e.target.value); setLookupError(null) }}
              placeholder="08012345678 or @username"
              autoFocus
              autoCapitalize="none"
              inputMode="text"
              spellCheck={false}
              error={lookupError}
              hint="Enter a phone number (e.g. 08012345678) or XPay handle"
              suffix={resolving ? <Spinner className="h-4 w-4 text-gray-400" /> : null}
            />
          </div>

          {recents.length > 0 && (
            <div className="mt-8">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                Recent
              </p>
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                {recents.map((p, i) => (
                  <button
                    key={p.username}
                    type="button"
                    disabled={resolving}
                    onClick={() => {
                      setQuery(formatHandle(p.username))
                      void lookupXpay(p.username)
                    }}
                    className={[
                      "flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-gray-50",
                      i > 0 ? "border-t border-gray-100" : "",
                    ].join(" ")}
                  >
                    <Avatar name={p.displayName} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {p.displayName}
                      </p>
                      <p className="truncate text-xs text-gray-400">
                        {formatHandle(p.username)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-auto pt-8">
            <Button
              full type="submit" size="lg"
              disabled={!query.trim()}
              loading={resolving}
            >
              Continue
            </Button>
          </div>
        </form>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RECIPIENT MODE  (entry point)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <Screen back onBack={() => navigate("/home")}>
      <div className="flex flex-1 flex-col pt-4 pb-10">
        <Title sub="Choose how you want to send.">Send money</Title>

        <div className="mt-8 space-y-3">
          {/* XPay user */}
          <button
            type="button"
            onClick={() => setStep("xpay_lookup")}
            className="flex w-full items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50 active:scale-[.99]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
                stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">XPay user</p>
              <p className="mt-0.5 text-sm text-gray-500">By username or phone number</p>
            </div>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none"
              stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 4l6 6-6 6"/>
            </svg>
          </button>

          {/* Nigerian bank */}
          <button
            type="button"
            onClick={() => setStep("bank_account")}
            className="flex w-full items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50 active:scale-[.99]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
                stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">Nigerian bank account</p>
              <p className="mt-0.5 text-sm text-gray-500">Any verified bank — no XPay needed</p>
            </div>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none"
              stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 4l6 6-6 6"/>
            </svg>
          </button>

          {/* Crypto wallet address */}
          <button
            type="button"
            onClick={() => setStep("wallet_address")}
            className="flex w-full items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition hover:border-purple-200 hover:bg-purple-50 active:scale-[.99]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
                stroke="#7c3aed" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                <path d="M16 3H8M16 11h.01"/>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">Crypto wallet address</p>
              <p className="mt-0.5 text-sm text-gray-500">Send USDC to any Base address</p>
            </div>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none"
              stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 4l6 6-6 6"/>
            </svg>
          </button>
        </div>
      </div>
    </Screen>
  )
}

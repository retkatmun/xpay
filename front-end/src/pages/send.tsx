/**
 * XPay Send Money — complete flow.
 *
 * Steps (XPay user):
 *   recipient_mode → xpay_lookup → amount → review → pin → sending → done
 *   Token: USDC (via backend quote) OR native ETH/token (direct on-chain to wallet address)
 *
 * Steps (bank):
 *   recipient_mode → bank_account → bank_confirm_recipient → amount → review → pin → sending → done
 *   Token: USDC only (must be converted to NGN for bank payout)
 *
 * Steps (crypto wallet):
 *   recipient_mode → wallet_address → amount → review → pin → sending → done
 *   Token: USDC or native
 *
 * XPay user + native send works exactly like a wallet address send:
 *   the recipient's stored wallet_address is fetched from Supabase and used directly.
 */

import { useEffect, useState, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useWallets } from "@privy-io/react-auth"
import { Avatar } from "@/components/Avatar"
import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { CodeInput } from "@/components/CodeInput"
import { Field } from "@/components/Field"
import { Screen, Title } from "@/components/Screen"
import { Spinner } from "@/components/icons"
import {
  ApiError,
  formatHandle, getQuote, getTransaction,
  getRecentRecipients, getBanks, resolveBankAccount,
  resolveRecipient,
} from "@/lib/api"
import { searchProfiles, supabaseAdmin } from "@/lib/supabase"
import { formatUSD, parseAmount, toNGN } from "@/lib/money"
import { useSession } from "@/lib/session"
import { useNetwork, CHAINS } from "@/lib/NetworkContext"
import type { ChainConfig } from "@/lib/NetworkContext"
import { useWalletBalances } from "@/lib/useUsdcBalance"
import { isTerminal, statusLabel } from "@/lib/txStatus"
import type { Bank, BankResolveResult, PublicUser, Quote, Transaction } from "@/lib/types"

// ─── Types ────────────────────────────────────────────────────────────────────

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

/** Which token the user has chosen to send */
type SelectedToken = "usdc" | "native"

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a native-token (18-decimal wei) bigint as a human string, max 6 dp */
function formatNative(wei: bigint, symbol: string): string {
  const ETH_UNIT = 10n ** 18n
  const whole = wei / ETH_UNIT
  const frac = wei % ETH_UNIT
  const fracStr = frac.toString().padStart(18, "0").slice(0, 6).replace(/0+$/, "")
  const body = fracStr ? `${whole}.${fracStr}` : `${whole}`
  return `${body} ${symbol}`
}

/** Parse a decimal string (e.g. "0.05") into wei bigint */
function parseNativeAmount(input: string): bigint | null {
  const cleaned = input.trim().replace(/,/g, "")
  if (!cleaned || !/^\d*(\.\d*)?$/.test(cleaned)) return null
  const [whole = "0", frac = ""] = cleaned.split(".")
  if (frac.length > 18) return null
  const padded = frac.padEnd(18, "0")
  const val = BigInt(whole) * 10n ** 18n + BigInt(padded)
  return val > 0n ? val : null
}

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
    case "rate_limited":          return "Too many verification attempts. Please try again tomorrow or use a different bank."
    case "sms_unavailable":       return "SMS service is unavailable right now. Please try again."
    case "fx_unavailable":        return "Could not get the current exchange rate. Please try again."
    case "unauthorized":          return "Your session has expired. Please log in again."
    case "too_many_requests":     return "Too many attempts. Please wait a moment and try again."
    case "bank_list_unavailable": return "Could not load bank list. Check your connection."
    case "network_error":         return "Network error. Check your connection and try again."
    default:                      return `Something went wrong (${reason}). Please try again.`
  }
}

// ─── Network + Token picker sub-component ─────────────────────────────────────

function NetworkAndTokenPicker({
  selectedChain,
  onChainChange,
  selectedToken,
  onTokenChange,
  usdcOnly = false,
}: {
  selectedChain: ChainConfig
  onChainChange: (c: ChainConfig) => void
  selectedToken: SelectedToken
  onTokenChange: (t: SelectedToken) => void
  usdcOnly?: boolean
}) {
  return (
    <div className="space-y-4">
      {/* Network pills */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Network
        </p>
        <div className="flex flex-wrap gap-2">
          {CHAINS.map(chain => {
            const active = selectedChain.id === chain.id
            return (
              <button
                key={chain.id}
                type="button"
                onClick={() => {
                  onChainChange(chain)
                  if (!chain.usdcAddress) onTokenChange("native")
                  else if (usdcOnly) onTokenChange("usdc")
                }}
                className={[
                  "rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
                  active
                    ? "border-emerald-500/70 text-white/90"
                    : "border-white/[0.10] bg-transparent text-white/40 hover:border-white/25 hover:text-white/65",
                ].join(" ")}
              >
                {chain.name}
                {chain.isTestnet && (
                  <span className="ml-1 text-white/30 font-normal">· test</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Segmented token toggle */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Token
        </p>
        <div className="inline-flex w-full rounded-xl border border-white/[0.10] p-0.5">
          <button
            type="button"
            onClick={() => onTokenChange("usdc")}
            className={[
              "flex flex-1 items-center justify-center gap-2 rounded-[10px] py-2.5 text-[13px] font-medium transition",
              selectedToken === "usdc"
                ? "bg-white/[0.07] text-white/90"
                : "text-white/35 hover:text-white/60",
            ].join(" ")}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><circle cx="10" cy="10" r="8"/><path d="M10 6v8M7 8.5h4.5a1.5 1.5 0 010 3H8.5a1.5 1.5 0 000 3H13"/></svg>
            USDC
          </button>
          <button
            type="button"
            disabled={usdcOnly || !selectedChain.nativeSymbol}
            onClick={() => !usdcOnly && onTokenChange("native")}
            className={[
              "flex flex-1 items-center justify-center gap-2 rounded-[10px] py-2.5 text-[13px] font-medium transition",
              usdcOnly
                ? "cursor-not-allowed text-white/20"
                : selectedToken === "native"
                ? "bg-white/[0.07] text-white/90"
                : "text-white/35 hover:text-white/60",
            ].join(" ")}
          >
            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 2L4 12l8 5 8-5L12 2z" fill="currentColor" opacity="0.7"/><path d="M4 12l8 10 8-10" fill="currentColor" opacity="0.4"/></svg>
            {selectedChain.nativeSymbol}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Send() {
  const navigate = useNavigate()
  const { authUser, profile, loading } = useSession()
  const { activeChain } = useNetwork()
  const { wallets } = useWallets()
  const embeddedWallet = wallets.find(w => w.walletClientType === "privy")

  // ── step ──
  const [step, setStep] = useState<Step>("recipient_mode")

  // ── network + token selection ──
  const [selectedChain, setSelectedChain] = useState<ChainConfig>(activeChain)
  const [selectedToken, setSelectedToken] = useState<SelectedToken>("usdc")

  // ── both balances (USDC + native) for the selected chain ──
  const { usdc: usdcBalance, eth: nativeBalance } = useWalletBalances(selectedChain)

  // ── xpay lookup ──
  const [recents, setRecents]             = useState<PublicUser[]>([])
  const [query, setQuery]                 = useState("")
  const [lookupError, setLookupError]     = useState<string | null>(null)
  const [xpayRecipient, setXpayRecipient] = useState<PublicUser | null>(null)
  const [suggestions, setSuggestions]     = useState<PublicUser[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimeoutRef                  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── bank / account ──
  const [banks, setBanks]                 = useState<Bank[]>([])
  const [bankSearch, setBankSearch]       = useState("")
  const [bankOpen, setBankOpen]           = useState(false)
  const [selectedBank, setSelectedBank]   = useState<Bank | null>(null)
  const [accountNumber, setAccountNumber] = useState("")
  const [verifying, setVerifying]         = useState(false)
  const [verifyError, setVerifyError]     = useState<string | null>(null)
  const [verifiedAccount, setVerifiedAccount] =
    useState<(BankResolveResult & { success: true }) | null>(null)
  const bankDropdownRef = useRef<HTMLDivElement>(null)

  // ── crypto wallet address ──
  const [walletAddressInput, setWalletAddressInput] = useState("")
  const [walletAddressError, setWalletAddressError] = useState<string | null>(null)
  const [walletRecipient, setWalletRecipient] =
    useState<{ address: string; label: string } | null>(null)

  // ── amount ──
  // rawAmount is always a decimal string in the token's unit
  // e.g. "10.50" means $10.50 USDC or 0.005 ETH
  const [rawAmount, setRawAmount] = useState("")
  const [memo, setMemo]           = useState("")

  // ── live USDC→NGN rate preview ──
  const [previewRate, setPreviewRate]       = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // ── quote (USDC sends only) ──
  const [quote, setQuote]               = useState<Quote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError]     = useState<string | null>(null)

  // ── pin / send ──
  const [pin, setPin]               = useState("")
  const [pinError, setPinError]     = useState<string | null>(null)
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
    void getRecentRecipients().then(setRecents).catch(() => {})
    void getBanks().then(raw => {
      const seen = new Set<string>()
      setBanks(raw.filter(b => {
        if (seen.has(b.code)) return false
        seen.add(b.code)
        return true
      }))
    }).catch(() => {})
  }, [authUser])

  // ─── Sync chain when global switcher changes ─────────────────────────────
  useEffect(() => { setSelectedChain(activeChain) }, [activeChain])

  // ─── Live XPay search (Supabase, debounced 300 ms) ───────────────────────
  useEffect(() => {
    const trimmed = query.trim()
    setSuggestions([])
    if (!trimmed || trimmed.length < 2) { setSearchLoading(false); return }
    setSearchLoading(true)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const rows = await searchProfiles(trimmed)
        setSuggestions(rows.map(r => ({
          username: r.username,
          displayName: r.display_name,
          walletAddress: r.wallet_address,
          phone: r.phone,
          avatarUrl: r.avatar_url,
        })))
      } catch {
        try {
          const result = await resolveRecipient(trimmed)
          setSuggestions(result.found ? [result.user] : [])
        } catch { setSuggestions([]) }
      } finally { setSearchLoading(false) }
    }, 300)
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current) }
  }, [query])

  // ─── Bank dropdown: close on outside click ────────────────────────────────
  useEffect(() => {
    if (!bankOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (bankDropdownRef.current && !bankDropdownRef.current.contains(e.target as Node)) {
        setBankOpen(false); setBankSearch("")
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [bankOpen])

  // ─── Fetch USDC→NGN preview rate when entering amount step ───────────────
  useEffect(() => {
    if (step !== "amount" || selectedToken !== "usdc") return
    if (previewRate !== null) return
    setPreviewLoading(true)
    getQuote(1_000_000n)
      .then(q => setPreviewRate(q.fxRate))
      .catch(() => {})
      .finally(() => setPreviewLoading(false))
  }, [step, selectedToken, previewRate])

  // ─── Reset amount state on entering amount step ───────────────────────────
  const prevStep = useRef<Step | null>(null)
  useEffect(() => {
    if (step === "amount" && prevStep.current !== "amount") {
      setRawAmount("")
      setQuote(null)
      setQuoteError(null)
    }
    prevStep.current = step
  }, [step])

  // ─── Poll receipt until terminal ─────────────────────────────────────────
  useEffect(() => {
    if (!receipt) return
    const init = setTimeout(() => setPolledTx(receipt), 0)
    if (isTerminal(receipt.status)) return () => clearTimeout(init)
    const id = setInterval(async () => {
      const fresh = await getTransaction(receipt.id).catch(() => null)
      if (fresh) { setPolledTx(fresh); if (isTerminal(fresh.status)) clearInterval(id) }
    }, 4000)
    return () => { clearTimeout(init); clearInterval(id) }
  }, [receipt])

  // ─── Derived ─────────────────────────────────────────────────────────────

  const isUsdcSend   = selectedToken === "usdc"
  const isNativeSend = selectedToken === "native"

  // Parsed amount in base units of the selected token
  const parsedUsdcAmount: bigint | null = (() => {
    if (!isUsdcSend) return null
    const v = parseAmount(rawAmount)    // 6-decimal USDC
    return v !== null && v > 0n ? v : null
  })()

  const parsedNativeAmount: bigint | null = (() => {
    if (!isNativeSend) return null
    return parseNativeAmount(rawAmount) // 18-decimal wei
  })()

  // Confirmed USDC amount from quote
  const usdcAmount: bigint | null = quote ? BigInt(quote.amount) : null

  // Live NGN preview for USDC
  const ngnPreview: bigint | null = (() => {
    if (!isUsdcSend || parsedUsdcAmount === null || !previewRate) return null
    return toNGN(parsedUsdcAmount, previewRate)
  })()

  // Balance for the currently selected token
  const relevantBalance: bigint | null = isUsdcSend ? usdcBalance : nativeBalance

  const overBalance = (() => {
    if (relevantBalance === null) return false
    if (isUsdcSend  && parsedUsdcAmount   !== null) return parsedUsdcAmount   > relevantBalance
    if (isNativeSend && parsedNativeAmount !== null) return parsedNativeAmount > relevantBalance
    return false
  })()

  const filteredBanks = bankSearch
    ? banks.filter(b => b.name.toLowerCase().includes(bankSearch.toLowerCase()))
    : banks

  // Recipient display strings
  const recipientLabel: string =
    xpayRecipient?.displayName ?? verifiedAccount?.accountName ?? walletRecipient?.label ?? ""

  const recipientSub: string =
    xpayRecipient
      ? formatHandle(xpayRecipient.username)
      : verifiedAccount
      ? `${verifiedAccount.bankName} · ****${verifiedAccount.accountNumber.slice(-4)}`
      : walletRecipient?.address ?? ""

  // Bank sends MUST use USDC (backend converts to NGN for payout).
  // XPay and wallet address sends can use USDC or native.
  const mustBeUsdc = !!verifiedAccount

  // Amount display helpers
  const tokenSymbol   = isUsdcSend ? "USDC" : selectedChain.nativeSymbol
  const tokenPrefix   = isUsdcSend ? "$" : ""
  const tokenSuffix   = isUsdcSend ? "" : ` ${selectedChain.nativeSymbol}`
  const amountIsValid = isUsdcSend ? parsedUsdcAmount !== null : parsedNativeAmount !== null

  // ─── Amount input handler ────────────────────────────────────────────────
  function handleAmountInput(e: React.ChangeEvent<HTMLInputElement>) {
    let val = e.target.value.replace(/[^\d.]/g, "")
    const parts = val.split(".")
    if (parts.length > 2) val = parts[0] + "." + parts.slice(1).join("")
    const maxDp = isUsdcSend ? 2 : 8
    if ((parts[0]?.length ?? 0) > 9) val = (parts[0] ?? "").slice(0, 9) + (parts[1] !== undefined ? "." + parts[1] : "")
    if ((parts[1]?.length ?? 0) > maxDp) val = (parts[0] ?? "") + "." + (parts[1] ?? "").slice(0, maxDp)
    setRawAmount(val)
    setQuote(null)
    setQuoteError(null)
  }

  // ─── Quote fetch (USDC only — for NGN preview on review screen) ──────────
  const fetchQuote = useCallback(async (usdAmount: bigint): Promise<Quote | null> => {
    setQuoteLoading(true)
    setQuoteError(null)
    setQuote(null)
    try {
      if (usdAmount < 1_000_000n) { setQuoteError("Minimum transfer is $1.00 USDC."); return null }
      const q = await getQuote(usdAmount)
      setQuote(q)
      return q
    } catch (err: unknown) {
      // Rate fetch failed — build a minimal quote so the send can still proceed
      // The NGN preview just won't show on the review screen
      const reason = err instanceof ApiError ? err.reason : err instanceof Error ? err.message : "server_error"
      if (reason === "fx_unavailable" || reason.includes("fx")) {
        // Build a zero-rate fallback quote so Continue still works
        const fallback: Quote = {
          id:            `local_${Date.now()}`,
          asset:         "USDC",
          amount:        usdAmount.toString(),
          fxRate:        0,
          feeNgn:        "0",
          ngnAmountGross: "0",
          ngnAmount:     "0",
          expiresAt:     new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        }
        setQuote(fallback)
        return fallback
      }
      setQuoteError(friendlyError(reason))
      return null
    } finally {
      setQuoteLoading(false)
    }
  }, [])

  // ─── Amount → Review ─────────────────────────────────────────────────────
  async function handleContinueFromAmount() {
    if (!amountIsValid || overBalance || quoteLoading) return
    if (isUsdcSend && parsedUsdcAmount) {
      const q = await fetchQuote(parsedUsdcAmount)
      if (!q) return
    }
    setStep("review")
  }

  // ─── Bank verification ───────────────────────────────────────────────────
  async function verifyBankAccount() {
    if (!selectedBank || accountNumber.length !== 10 || verifying) return
    setVerifying(true); setVerifyError(null)
    try {
      const result = await resolveBankAccount(selectedBank.code, accountNumber)
      if (!result.success) { setVerifyError(friendlyError(result.reason)); return }
      setVerifiedAccount(result)
      setStep("bank_confirm_recipient")
    } catch {
      setVerifyError("Could not reach the verification service. Check your connection.")
    } finally { setVerifying(false) }
  }

  // ─── PIN ────────────────────────────────────────────────────────────────
  function handlePin(next: string) {
    if (submitting) return
    setPinError(null); setPin(next)
    if (next.length === 4) void submitTransfer(next)
  }

  // ─── Submit transfer ────────────────────────────────────────────────────
  async function submitTransfer(pinValue: string) {
    if (isUsdcSend && !parsedUsdcAmount) {
      setPinError("Enter an amount to continue."); return
    }
    if (submitting) return
    setSubmitting(true); setStep("sending")

    try {
      // ── Native token send: verify PIN locally, execute on-chain directly ──
      if (!isUsdcSend) {
        // 1. Verify PIN against stored hash (plain comparison — hash is stored as plain text)
        if (!profile?.pin_hash || pinValue !== profile.pin_hash) {
          setPinError("Incorrect PIN. Try again."); setPin(""); setStep("pin")
          setSubmitting(false); return
        }

        // 2. Resolve recipient address
        let toAddress: string | null = null
        let recipientLabel = ""
        if (xpayRecipient) {
          toAddress = xpayRecipient.walletAddress ?? null
          recipientLabel = xpayRecipient.displayName || xpayRecipient.username
          if (!toAddress) {
            setPinError("This user has no wallet address set up yet.")
            setPin(""); setStep("pin"); setSubmitting(false); return
          }
        } else if (walletRecipient) {
          toAddress = walletRecipient.address
          recipientLabel = walletRecipient.label || walletRecipient.address
        } else {
          setPinError("Recipient missing. Please start again.")
          setPin(""); setStep("pin"); setSubmitting(false); return
        }

        // 3. Execute on-chain via Privy embedded wallet
        if (!embeddedWallet) {
          setPinError("Wallet not ready. Please try again.")
          setPin(""); setStep("pin"); setSubmitting(false); return
        }
        const provider = await embeddedWallet.getEthereumProvider()

        // Switch to correct chain
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${selectedChain.id.toString(16)}` }],
          })
        } catch { /* already on correct chain */ }

        const weiHex = `0x${parsedNativeAmount!.toString(16)}`
        const txHash = await provider.request({
          method: "eth_sendTransaction",
          params: [{
            from:  embeddedWallet.address,
            to:    toAddress,
            value: weiHex,
            data:  "0x",
          }],
        }) as string

        // 4. Record in Supabase
        const now = new Date().toISOString()
        await supabaseAdmin.from("transactions").insert({
          user_id:                         authUser!.id,
          direction:                       "out",
          recipient_type:                  "xpay_user",
          recipient_display_name:          recipientLabel,
          recipient_username:              xpayRecipient?.username ?? null,
          recipient_bank_name:             null,
          recipient_account_number_last4:  null,
          asset:                           selectedChain.nativeSymbol,
          amount:                          parsedNativeAmount!.toString(),
          chain_id:                        selectedChain.id,
          tx_hash:                         txHash,
          status:                          "completed",
          fee_ngn:                         "0",
          fx_rate:                         0,
          ngn_amount:                      "0",
          memo:                            memo || null,
          created_at:                      now,
          updated_at:                      now,
        })

        // 5. Build a minimal receipt to show the done screen
        const fakeReceipt: Transaction = {
          id:                          txHash,
          status:                      "completed",
          amount:                      parsedNativeAmount!.toString(),
          ngnAmount:                   "0",
          feeNgn:                      "0",
          fxRate:                      0,
          asset:                       selectedChain.nativeSymbol,
          direction:                   "out",
          recipientType:               "xpay_user",
          recipientDisplayName:        recipientLabel,
          recipientUsername:           xpayRecipient?.username ?? null,
          recipientBankName:           null,
          recipientAccountNumberLast4: null,
          memo:                        memo || null,
          txHash,
          chainId:                     selectedChain.id,
          createdAt:                   now,
          updatedAt:                   now,
        }
        setReceipt(fakeReceipt); setStep("done")
        return
      }

      // ── USDC send: verify PIN locally, execute ERC-20 transfer on-chain ──
      if (!profile?.pin_hash || pinValue !== profile.pin_hash) {
        setPinError("Incorrect PIN. Try again."); setPin(""); setStep("pin")
        setSubmitting(false); return
      }

      // Resolve recipient wallet address
      let toAddress: string | null = null
      let recipientLabel = ""
      if (xpayRecipient) {
        toAddress = xpayRecipient.walletAddress ?? null
        recipientLabel = xpayRecipient.displayName || xpayRecipient.username
        if (!toAddress) {
          setPinError("This user has no wallet address set up yet.")
          setPin(""); setStep("pin"); setSubmitting(false); return
        }
      } else if (walletRecipient) {
        toAddress = walletRecipient.address
        recipientLabel = walletRecipient.label || walletRecipient.address
      } else if (verifiedAccount) {
        // Bank sends still need the backend — re-throw as friendly error
        setPinError("Bank payouts are not available right now. Please try again later.")
        setPin(""); setStep("pin"); setSubmitting(false); return
      } else {
        setPinError("Recipient missing. Please start again.")
        setPin(""); setStep("pin"); setSubmitting(false); return
      }

      if (!embeddedWallet) {
        setPinError("Wallet not ready. Please try again.")
        setPin(""); setStep("pin"); setSubmitting(false); return
      }

      const usdcAddress = selectedChain.usdcAddress
      if (!usdcAddress) {
        setPinError("USDC is not supported on this network.")
        setPin(""); setStep("pin"); setSubmitting(false); return
      }

      // Build ERC-20 transfer(address,uint256) calldata
      // selector: a9059cbb
      const paddedTo     = toAddress.slice(2).toLowerCase().padStart(64, "0")
      const paddedAmount = parsedUsdcAmount!.toString(16).padStart(64, "0")
      const transferData = `0xa9059cbb${paddedTo}${paddedAmount}`

      const provider = await embeddedWallet.getEthereumProvider()
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${selectedChain.id.toString(16)}` }],
        })
      } catch { /* already on correct chain */ }

      const txHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from:  embeddedWallet.address,
          to:    usdcAddress,
          data:  transferData,
          value: "0x0",
        }],
      }) as string

      // Record in Supabase
      const now = new Date().toISOString()
      await supabaseAdmin.from("transactions").insert({
        user_id:                         authUser!.id,
        direction:                       "out",
        recipient_type:                  "xpay_user",
        recipient_display_name:          recipientLabel,
        recipient_username:              xpayRecipient?.username ?? null,
        recipient_bank_name:             null,
        recipient_account_number_last4:  null,
        asset:                           "USDC",
        amount:                          parsedUsdcAmount!.toString(),
        chain_id:                        selectedChain.id,
        tx_hash:                         txHash,
        status:                          "completed",
        fee_ngn:                         quote?.feeNgn ?? "0",
        fx_rate:                         quote?.fxRate ?? 0,
        ngn_amount:                      quote?.ngnAmount ?? "0",
        memo:                            memo || null,
        created_at:                      now,
        updated_at:                      now,
      })

      const receipt: Transaction = {
        id:                          txHash,
        status:                      "completed",
        amount:                      parsedUsdcAmount!.toString(),
        ngnAmount:                   quote?.ngnAmount ?? "0",
        feeNgn:                      quote?.feeNgn ?? "0",
        fxRate:                      quote?.fxRate ?? 0,
        asset:                       "USDC",
        direction:                   "out",
        recipientType:               "xpay_user",
        recipientDisplayName:        recipientLabel,
        recipientUsername:           xpayRecipient?.username ?? null,
        recipientBankName:           null,
        recipientAccountNumberLast4: null,
        memo:                        memo || null,
        txHash,
        chainId:                     selectedChain.id,
        createdAt:                   now,
        updatedAt:                   now,
      }
      setReceipt(receipt); setStep("done")
    } catch (err) {
      console.error("[XPay] submitTransfer:", err)
      const msg = err instanceof Error ? err.message : ""
      const pinErr = msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("cancel")
        ? "You cancelled the transaction."
        : "Network error. Please try again."
      setPinError(pinErr); setPin(""); setStep("pin")
    } finally { setSubmitting(false) }
  }

  // ─── Guard ────────────────────────────────────────────────────────────────
  if (!authUser) return <div className="min-h-dvh bg-[#1a1a1c]" />

  // ══════════════════════════════════════════════════════════════════════════
  // DONE
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "done") {
    const tx = polledTx ?? receipt
    if (!tx) return <div className="min-h-dvh bg-[#1a1a1c]" />

    const usd     = BigInt(tx.amount)
    const ngn     = BigInt(tx.ngnAmount)
    const pending = !isTerminal(tx.status)
    const failed  = ["blockchain_failed","payout_failed","cancelled","expired"].includes(tx.status)

    const headline = pending ? "Transfer in progress"
      : failed ? "Transfer failed"
      : tx.recipientType === "bank_account" ? "Transfer initiated"
      : "Sent!"

    const iconColor = pending ? "#2563eb" : failed ? "#dc2626" : "#16a34a"
    const iconBg    = pending ? "bg-emerald-500/10 ring-blue-50/50" : failed ? "bg-red-50 ring-red-50/50" : "bg-green-50 ring-green-50/50"

    return (
      <Screen back onBack={() => navigate(-1)}>
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-16 text-center">
          <div className={`flex h-20 w-20 items-center justify-center rounded-full ring-8 ${iconBg}`}>
            {pending ? <Spinner className="h-8 w-8 text-emerald-400" />
              : failed ? (
                <svg viewBox="0 0 32 32" width="36" height="36" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round">
                  <path d="M8 8l16 16M24 8L8 24" />
                </svg>
              ) : (
                <svg viewBox="0 0 32 32" width="36" height="36" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 16l8 8 12-14" />
                </svg>
              )}
          </div>

          <h1 className="mt-6 font-[var(--font-instrument-serif)] text-[2rem] tracking-[-0.02em] text-white/90">{headline}</h1>

          {pending && <p className="mt-2 max-w-[280px] text-sm text-white/50">Your transfer is being processed. This usually takes a few minutes.</p>}
          {failed  && <p className="mt-2 max-w-[280px] text-sm text-red-600">The transfer could not be completed. If money left your account, it will be reversed automatically.</p>}

          {!failed && (
            <>
              <p className="mt-4 font-[var(--font-instrument-serif)] text-[3rem] leading-none tracking-[-0.03em] tabular-nums text-white/90">
                {isUsdcSend ? formatUSD(usd) : formatNative(usd, selectedChain.nativeSymbol)}
              </p>
              {ngn > 0n && isUsdcSend && (
                <p className="mt-1.5 text-sm text-white/50 tabular-nums">≈ ₦{ngn.toLocaleString("en-NG")} to recipient</p>
              )}
            </>
          )}

          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#161618] px-5 py-4">
            {tx.recipientType === "bank_account" ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
                </svg>
              </div>
            ) : <Avatar name={tx.recipientDisplayName} size={40} />}
            <div className="text-left">
              <p className="text-sm font-semibold text-white/90">{tx.recipientDisplayName}</p>
              {tx.recipientBankName && <p className="text-xs text-white/50">{tx.recipientBankName} · ****{tx.recipientAccountNumberLast4}</p>}
              <Badge variant={pending ? "blue" : failed ? "red" : "green"}>{statusLabel(tx.status)}</Badge>
            </div>
          </div>

          {tx.txHash && (
            <a href={`${selectedChain.blockExplorer}/tx/${tx.txHash}`} target="_blank" rel="noreferrer"
              className="mt-4 text-xs text-emerald-400 underline-offset-2 hover:underline">
              View on {selectedChain.name} explorer ↗
            </a>
          )}
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
            <p className="text-sm font-medium text-white/80">Processing your transfer…</p>
            <p className="mt-1 text-xs text-white/40">Do not close this screen.</p>
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PIN
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "pin") {
    const sendAmount = isUsdcSend && usdcAmount !== null
      ? formatUSD(usdcAmount)
      : isNativeSend && parsedNativeAmount !== null
      ? formatNative(parsedNativeAmount, selectedChain.nativeSymbol)
      : "—"

    return (
      <Screen back onBack={() => { if (submitting) return; setStep("review"); setPin(""); setPinError(null) }}>
        <div className="flex flex-1 flex-col pt-4 pb-10">
          <Title sub="Enter your 4-digit PIN to authorise this transfer.">Confirm transfer</Title>

          <div className="mt-6 rounded-2xl border border-white/[0.06] bg-[#161618] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {xpayRecipient ? <Avatar name={recipientLabel} size={40} src={xpayRecipient.avatarUrl} />
                  : walletRecipient ? (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#7c3aed" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8M16 11h.01"/>
                      </svg>
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
                      </svg>
                    </div>
                  )}
                <div>
                  <p className="text-sm font-semibold text-white/90">{recipientLabel}</p>
                  <p className="truncate max-w-[140px] text-xs text-white/50">{recipientSub}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold tabular-nums text-white/90">{sendAmount}</p>
                {isUsdcSend && quote && <p className="text-xs text-white/40 tabular-nums">≈ ₦{BigInt(quote.ngnAmount).toLocaleString("en-NG")}</p>}
              </div>
            </div>

            <div className="mt-4 space-y-1.5 border-t border-white/[0.08] pt-4 text-xs text-white/50">
              <div className="flex justify-between">
                <span>Network</span>
                <span className="font-semibold" style={{ color: selectedChain.color }}>{selectedChain.name}</span>
              </div>
              <div className="flex justify-between">
                <span>Token</span>
                <span className="font-semibold text-white/80">{tokenSymbol}</span>
              </div>
              {isUsdcSend && quote && (
                <>
                  <div className="flex justify-between">
                    <span>Rate</span>
                    <span className="tabular-nums">$1 = ₦{quote.fxRate.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fee</span>
                    <span>{BigInt(quote.feeNgn) === 0n ? "Free" : `₦${BigInt(quote.feeNgn).toLocaleString()}`}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-white/90">
                    <span>Recipient receives</span>
                    <span className="tabular-nums text-emerald-400">₦{BigInt(quote.ngnAmount).toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="mt-8 text-center">
            <CodeInput label="4-digit PIN" length={4} value={pin} onChange={handlePin} secret autoFocus error={!!pinError} />
            {pinError && <p className="mt-2 text-sm text-red-600">{pinError}</p>}
            {submitting
              ? <p className="mt-3 flex items-center justify-center gap-2 text-xs text-white/40"><Spinner className="h-3 w-3" /> Processing…</p>
              : <p className="mt-3 text-xs text-white/40">Your PIN securely authorises this transfer.</p>
            }
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REVIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "review") {
    return (
      <Screen back onBack={() => setStep("amount")} title="Review transfer">
        <div className="flex flex-1 flex-col pt-4 pb-10">
          <Title>Review transfer</Title>

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.06] bg-black shadow-sm">
            {/* Recipient */}
            <div className="p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">Recipient</p>
              <div className="flex items-center gap-3">
                {xpayRecipient ? <Avatar name={recipientLabel} size={40} src={xpayRecipient.avatarUrl} />
                  : walletRecipient ? (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-50">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#7c3aed" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8M16 11h.01"/>
                      </svg>
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
                      </svg>
                    </div>
                  )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white/90">{recipientLabel}</p>
                  <p className="truncate text-sm text-white/50">{recipientSub}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: selectedChain.color + "18", color: selectedChain.color }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: selectedChain.color }} />
                    {selectedChain.shortName}
                  </div>
                  <span className="text-[10px] font-semibold text-white/40">{tokenSymbol}</span>
                </div>
              </div>
            </div>

            {/* Amounts */}
            <div className="border-t border-white/[0.06]">
              {isUsdcSend ? (
                quoteLoading ? (
                  <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-white/40">
                    <Spinner className="h-4 w-4 text-blue-500" /> Getting your rate…
                  </div>
                ) : quoteError ? (
                  <div className="px-4 py-4">
                    <p className="text-sm text-red-600">{quoteError}</p>
                    <button type="button" className="mt-2 text-xs text-emerald-400 underline"
                      onClick={() => parsedUsdcAmount && void fetchQuote(parsedUsdcAmount)}>Retry</button>
                  </div>
                ) : quote ? (
                  <>
                    <div className="flex justify-between px-4 py-3">
                      <span className="text-sm text-white/50">You send</span>
                      <span className="text-sm font-medium tabular-nums">{formatUSD(BigInt(quote.amount))} USDC</span>
                    </div>
                    <div className="flex justify-between border-t border-white/[0.06] px-4 py-3">
                      <span className="text-sm text-white/50">Exchange rate</span>
                      <span className="text-sm tabular-nums text-white/70">$1 = ₦{quote.fxRate.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between border-t border-white/[0.06] px-4 py-3">
                      <span className="text-sm text-white/50">Fee</span>
                      <span className="text-sm tabular-nums text-white/70">
                        {BigInt(quote.feeNgn) === 0n ? <Badge variant="green">Free</Badge> : `₦${BigInt(quote.feeNgn).toLocaleString()}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-white/[0.06] bg-emerald-500/10 px-4 py-4 rounded-b-2xl">
                      <span className="text-sm font-semibold text-white/90">Recipient receives</span>
                      <span className="text-base font-bold tabular-nums text-emerald-400">₦{BigInt(quote.ngnAmount).toLocaleString()}</span>
                    </div>
                  </>
                ) : null
              ) : (
                /* Native token — simple summary, no NGN conversion */
                <>
                  <div className="flex justify-between px-4 py-3">
                    <span className="text-sm text-white/50">You send</span>
                    <span className="text-sm font-medium tabular-nums">
                      {parsedNativeAmount !== null ? formatNative(parsedNativeAmount, selectedChain.nativeSymbol) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-white/[0.06] px-4 py-3">
                    <span className="text-sm text-white/50">Network</span>
                    <span className="text-sm font-semibold" style={{ color: selectedChain.color }}>{selectedChain.name}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/[0.06] bg-[#161618] px-4 py-4 rounded-b-2xl">
                    <span className="text-sm font-semibold text-white/90">Token</span>
                    <span className="text-base font-bold text-white/90">{selectedChain.nativeSymbol}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {isUsdcSend && quote && (
            <p className="mt-2 text-center text-xs text-white/40">
              Rate valid until {new Date(quote.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}

          <div className="mt-auto pt-6">
            <Button full size="lg"
              disabled={isUsdcSend ? (quoteLoading || !quote || !!quoteError) : !parsedNativeAmount}
              onClick={() => setStep("pin")}>
              Continue to PIN
            </Button>
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AMOUNT
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "amount") {
    const ngnDisplay = ngnPreview !== null ? ngnPreview.toLocaleString("en-NG") : null

    // Balance display
    const balanceDisplay = (() => {
      if (relevantBalance === null) return null
      if (isUsdcSend) return `${formatUSD(relevantBalance)} USDC`
      return formatNative(relevantBalance, selectedChain.nativeSymbol)
    })()

    return (
      <Screen
        back
        onBack={() => {
          if (xpayRecipient) { setStep("xpay_lookup"); setXpayRecipient(null) }
          else if (walletRecipient) { setStep("wallet_address"); setWalletRecipient(null) }
          else { setStep("bank_confirm_recipient") }
        }}
      >
        <div className="flex flex-1 flex-col pt-4 pb-10">
          {/* Recipient chip */}
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#161618] px-4 py-3">
            {xpayRecipient ? <Avatar name={recipientLabel} size={36} src={xpayRecipient.avatarUrl} />
              : walletRecipient ? (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-50">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#7c3aed" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8M16 11h.01"/>
                  </svg>
                </div>
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
                  </svg>
                </div>
              )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white/90">{recipientLabel}</p>
              <p className="truncate text-xs text-white/50">{recipientSub}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <div className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ backgroundColor: selectedChain.color + "18", color: selectedChain.color }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: selectedChain.color }} />
                {selectedChain.shortName}
              </div>
              <span className="text-[10px] font-semibold text-white/40">{tokenSymbol}</span>
            </div>
          </div>

          {/* Big amount input */}
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">
              Amount in {tokenSymbol}
            </p>
            <div className="flex items-baseline gap-1">
              {tokenPrefix && (
                <span className={`text-[2.5rem] font-light leading-none ${rawAmount ? "text-white/50" : "text-gray-200"}`}>
                  {tokenPrefix}
                </span>
              )}
              <input
                value={rawAmount}
                onChange={handleAmountInput}
                inputMode="decimal"
                autoFocus
                aria-label={`Amount in ${tokenSymbol}`}
                placeholder={isUsdcSend ? "0.00" : "0.000000"}
                className="min-w-0 bg-transparent text-[3.25rem] font-semibold leading-none tracking-[-0.03em] text-white/90 outline-none placeholder:text-gray-200 tabular-nums"
                style={{ width: `${Math.max((rawAmount || (isUsdcSend ? "0.00" : "0.000")).length, 4)}ch` }}
              />
              {tokenSuffix && (
                <span className={`ml-1 text-2xl font-light leading-none ${rawAmount ? "text-white/50" : "text-gray-200"}`}>
                  {tokenSuffix}
                </span>
              )}
            </div>

            {/* NGN preview (USDC only) */}
            <div className="mt-3 flex h-6 items-center justify-center gap-1.5">
              {isUsdcSend && parsedUsdcAmount !== null && (
                previewLoading ? (
                  <span className="flex items-center gap-1 text-xs text-white/30"><Spinner className="h-3 w-3" /> loading rate…</span>
                ) : ngnDisplay !== null ? (
                  <span className="text-sm font-medium tabular-nums text-white/50">
                    ≈ <span className="text-white/80">₦{ngnDisplay}</span>
                    <span className="ml-1.5 text-[10px] font-normal text-white/30">live preview</span>
                  </span>
                ) : (
                  <span className="text-xs text-white/30">rate unavailable</span>
                )
              )}
              {isNativeSend && (
                <span className="text-xs text-white/40">
                  Sending native <strong>{selectedChain.nativeSymbol}</strong> on {selectedChain.name}
                </span>
              )}
            </div>

            {/* Balance */}
            <p className="mt-2 h-4 text-xs tabular-nums">
              {overBalance ? (
                <span className="text-red-500">Exceeds your available balance</span>
              ) : balanceDisplay ? (
                <span className="text-white/30">Balance: {balanceDisplay} available</span>
              ) : null}
            </p>
          </div>

          {/* USDC-only notice for bank sends only */}
          {mustBeUsdc && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-blue-100 bg-emerald-500/10 px-3 py-2">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="6"/><path d="M8 5v3.5M8 11v.5"/>
              </svg>
              <p className="text-[11px] text-emerald-400">Bank payouts require <strong>USDC</strong>. It is converted to Naira for the recipient.</p>
            </div>
          )}

          <div className="shrink-0 space-y-3">
            <Field
              value={memo}
              onChange={e => setMemo(e.target.value.slice(0, 60))}
              placeholder="Add a note (optional)"
              maxLength={60}
            />
            <Button full size="lg"
              disabled={!amountIsValid || overBalance || quoteLoading}
              loading={quoteLoading}
              onClick={handleContinueFromAmount}>
              {quoteLoading ? "Getting rate…" : "Continue"}
            </Button>
            {quoteError && <p className="text-center text-sm text-red-600">{quoteError}</p>}
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
      <Screen back onBack={() => { setStep("bank_account"); setVerifiedAccount(null) }}>
        <div className="flex flex-1 flex-col pt-4 pb-10">
          <Title sub="Please verify the account name carefully.">Confirm recipient</Title>
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.06] bg-black shadow-sm">
            <div className="flex items-center justify-center py-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 ring-8 ring-green-50/60">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
              </div>
            </div>
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              <div className="flex justify-between px-5 py-3.5">
                <span className="text-sm text-white/50">Bank</span>
                <span className="text-sm font-medium text-white/90">{verifiedAccount.bankName}</span>
              </div>
              <div className="flex justify-between px-5 py-3.5">
                <span className="text-sm text-white/50">Account number</span>
                <span className="text-sm font-medium tabular-nums text-white/90">****{verifiedAccount.accountNumber.slice(-4)}</span>
              </div>
              <div className="flex justify-between bg-[#161618] px-5 py-4">
                <span className="text-sm text-white/50">Account name</span>
                <span className="text-sm font-bold uppercase tracking-wide text-white/90">{verifiedAccount.accountName}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs leading-relaxed text-amber-700">Verify the name above before proceeding. Once sent, the money cannot be recalled.</p>
          </div>
          <div className="mt-auto space-y-3 pt-6">
            <Button full size="lg" onClick={() => setStep("amount")}>Yes, this is correct</Button>
            <Button full variant="secondary" onClick={() => { setStep("bank_account"); setVerifiedAccount(null) }}>Change account</Button>
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BANK: ACCOUNT ENTRY
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "bank_account") {
    const canVerify = !!selectedBank && accountNumber.length === 10 && !verifying
    return (
      <Screen back onBack={() => { setStep("recipient_mode"); setSelectedBank(null); setBankSearch(""); setBankOpen(false); setAccountNumber(""); setVerifyError(null) }}>
        <div className="flex flex-1 flex-col pt-4 pb-10">
          <Title sub="Enter the recipient's bank and 10-digit account number.">Send to bank account</Title>

          <div className="mt-6 space-y-4">
            {/* Bank combobox */}
            <div ref={bankDropdownRef} className="relative">
              <label className="mb-1.5 block text-sm font-medium text-white/70">Bank</label>
              <div role="combobox" aria-expanded={bankOpen} aria-haspopup="listbox" tabIndex={0}
                onClick={() => setBankOpen(v => !v)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBankOpen(v => !v) }
                  if (e.key === "Escape") { setBankOpen(false); setBankSearch("") }
                }}
                className={["flex h-11 cursor-pointer select-none items-center gap-2 rounded-xl border bg-[#111113] px-4 transition-colors duration-150 focus:outline-none",
                  bankOpen ? "border-emerald-500/60" : "border-white/[0.12] hover:border-white/25"].join(" ")}>
                {bankOpen ? (
                  <input value={bankSearch} onChange={e => setBankSearch(e.target.value)} placeholder="Search banks…" autoFocus
                    onClick={e => e.stopPropagation()}
                    className="min-w-0 flex-1 bg-transparent text-base text-white/90 outline-none placeholder:text-white/40" />
                ) : (
                  <span className={`flex-1 text-base ${selectedBank ? "text-white/90" : "text-white/40"}`}>
                    {selectedBank ? selectedBank.name : "Select bank"}
                  </span>
                )}
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  className={`shrink-0 transition-transform duration-150 ${bankOpen ? "rotate-180" : ""}`} aria-hidden>
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
                        className={["flex min-h-[44px] cursor-pointer items-center px-4 py-3 text-sm transition-colors",
                          selectedBank?.code === bank.code ? "bg-[#1e2e1e] font-semibold text-emerald-400" : "text-white/90 hover:bg-[#1c1c1e]",
                          i > 0 ? "border-t border-white/[0.06]" : ""].join(" ")}>
                        {bank.name}
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {/* Account number */}
            <Field label="Account number" value={accountNumber}
              onChange={e => { setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10)); setVerifyError(null) }}
              inputMode="numeric" placeholder="0123456789" maxLength={10} autoComplete="off" error={verifyError}
              pasteButton
              onPasteValue={text => { setAccountNumber(text.replace(/\D/g, "").slice(0, 10)); setVerifyError(null) }}
              hint={accountNumber.length > 0 && accountNumber.length < 10 ? `${accountNumber.length} of 10 digits` : accountNumber.length === 0 ? "Nigerian account numbers are exactly 10 digits" : undefined}
              suffix={accountNumber.length === 10
                ? <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10l5 5 7-9"/></svg>
                : <span className="text-xs font-medium tabular-nums text-white/40">{accountNumber.length}/10</span>
              }
            />
          </div>

          <div className="mt-auto pt-6">
            <Button full size="lg" disabled={!canVerify} loading={verifying} onClick={verifyBankAccount}>
              {verifying ? "Verifying account…" : "Verify account"}
            </Button>
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WALLET ADDRESS  (crypto send — network + token picker here)
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "wallet_address") {
    const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(walletAddressInput.trim())

    return (
      <Screen back onBack={() => { setStep("recipient_mode"); setWalletAddressInput(""); setWalletAddressError(null); setWalletRecipient(null) }}>
        <form
          onSubmit={e => {
            e.preventDefault()
            const addr = walletAddressInput.trim()
            if (!isValidAddress) { setWalletAddressError("Enter a valid EVM wallet address (0x…, 42 characters)"); return }
            setWalletRecipient({ address: addr, label: addr.slice(0, 6) + "…" + addr.slice(-4) })
            setWalletAddressError(null)
            setStep("amount")
          }}
          className="flex flex-1 flex-col pt-4 pb-10"
        >
          <Title sub="Send crypto to any EVM-compatible wallet address.">Crypto wallet address</Title>

          {/* Network + token picker */}
          <div className="mt-5">
            <NetworkAndTokenPicker
              selectedChain={selectedChain}
              onChainChange={chain => {
                setSelectedChain(chain)
                if (!chain.usdcAddress) setSelectedToken("native")
              }}
              selectedToken={selectedToken}
              onTokenChange={setSelectedToken}
              usdcOnly={false}
            />
          </div>

          {/* Address field — monospace, Paste as plain accent text inside */}
          <div className="mt-5">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-white/40">
              Recipient address
            </label>
            <div
              className={[
                "flex h-12 items-center rounded-xl border bg-transparent transition",
                walletAddressError
                  ? "border-red-400"
                  : "border-white/[0.12] focus-within:border-white/30",
              ].join(" ")}
            >
              <input
                value={walletAddressInput}
                onChange={e => { setWalletAddressInput(e.target.value); setWalletAddressError(null) }}
                placeholder="0x..."
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent pl-4 font-mono text-[14px] text-white/90 outline-none placeholder:font-sans placeholder:text-white/30"
              />
              {/* Plain "Paste" text inside the field, right side */}
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText()
                    if (text) { setWalletAddressInput(text.trim()); setWalletAddressError(null) }
                  } catch { /* clipboard denied */ }
                }}
                className="shrink-0 pr-4 text-[13px] font-semibold text-emerald-400 transition hover:text-emerald-300"
              >
                Paste
              </button>
            </div>
            {walletAddressError && <p className="mt-1.5 text-xs text-red-400">{walletAddressError}</p>}
            {!walletAddressError && walletAddressInput && (
              <p className={`mt-1.5 text-xs ${isValidAddress ? "text-green-600" : "text-white/40"}`}>
                {isValidAddress
                  ? `✓ Valid address · ${tokenSymbol} on ${selectedChain.name}`
                  : "Must be a 42-character hex address starting with 0x"}
              </p>
            )}
          </div>

          {/* Warning box — dark text on soft yellow, no selection glow */}
          <div
            className="mt-4 rounded-xl border px-4 py-3"
            style={{
              backgroundColor: "#fff8e1",
              borderColor: "#f59e0b",
            }}
          >
            <style>{`
              .wallet-warning-box *::selection { background: #f59e0b33; color: #3d2f00; }
              .wallet-warning-box *::-moz-selection { background: #f59e0b33; color: #3d2f00; }
            `}</style>
            <p
              className="wallet-warning-box text-[13px] leading-relaxed"
              style={{ color: "#3d2f00" }}
            >
              <strong>Double-check the network.</strong> Only send to addresses that support{" "}
              <strong>{tokenSymbol}</strong> on <strong>{selectedChain.name}</strong>.
              Sending to the wrong network may result in permanent loss.
            </p>
          </div>

          <div className="mt-auto pt-8">
            <Button full type="submit" size="lg" disabled={!walletAddressInput.trim()}>Continue</Button>
          </div>
        </form>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // XPAY LOOKUP  (USDC only — network picker, no token toggle)
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "xpay_lookup") {
    const seen = new Set<string>()
    const combined: PublicUser[] = []
    for (const u of [...suggestions, ...recents]) {
      if (!seen.has(u.username)) { seen.add(u.username); combined.push(u) }
    }
    const isTyping     = query.trim().length >= 2
    const isPhoneQuery = /^[0-9+\s\-()]{4,}$/.test(query.trim())

    return (
      <Screen back onBack={() => { setStep("recipient_mode"); setQuery(""); setLookupError(null); setSuggestions([]) }}>
        <div className="flex flex-1 flex-col pt-4 pb-10">

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-[22px] font-semibold tracking-tight text-white/90">Who are you paying?</h1>
            <p className="mt-1 text-[13px] text-white/40">Handle or phone number</p>
          </div>

          {/* Search field */}
          <div className={[
            "flex h-12 items-center gap-2.5 rounded-xl border px-3.5 transition",
            query.length > 0 ? "border-emerald-500/60" : "border-white/[0.12]",
          ].join(" ")}>
            {isPhoneQuery
              ? <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/></svg>
              : <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M14.5 14.5l3.5 3.5"/></svg>
            }
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setLookupError(null) }}
              placeholder="username.xpay or phone"
              autoFocus autoCapitalize="none" autoComplete="off" inputMode="text" spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-white/85 outline-none placeholder:text-white/30"
            />
            {searchLoading && <Spinner className="h-3.5 w-3.5 shrink-0 text-white/30" />}
            {query.length > 0 && !searchLoading && (
              <button
                type="button"
                onClick={() => { setQuery(""); setSuggestions([]) }}
                className="shrink-0 text-white/30 transition hover:text-white/60"
              >
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
              </button>
            )}
            {!query && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText()
                    if (text) { setQuery(text.trim()); setLookupError(null) }
                  } catch { /* clipboard denied */ }
                }}
                className="shrink-0 text-[12px] font-semibold text-emerald-400 transition hover:text-emerald-300"
              >
                Paste
              </button>
            )}
          </div>

          {lookupError && <p className="mt-2 text-[12px] text-red-400">{lookupError}</p>}

          {/* Network selector */}
          <div className="mt-6">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-white/25">Network</p>
            <div className="flex flex-wrap gap-2">
              {CHAINS.map(chain => {
                const active = selectedChain.id === chain.id
                return (
                  <button
                    key={chain.id}
                    type="button"
                    onClick={() => {
                      setSelectedChain(chain)
                      if (!chain.usdcAddress) setSelectedToken("native")
                      else if (false) setSelectedToken("usdc") // usdcOnly not applicable here
                    }}
                    className={[
                      "rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
                      active
                        ? "border-emerald-500/60 text-white"
                        : "border-white/[0.1] text-white/35 hover:border-white/25 hover:text-white/60",
                    ].join(" ")}
                  >
                    {chain.name}
                    {chain.isTestnet && (
                      <span className="ml-1 text-white/30">· test</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Token selector */}
          <div className="mt-5">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-white/25">Token</p>
            <div className="inline-flex w-full rounded-xl border border-white/[0.1] p-0.5">
              <button
                type="button"
                onClick={() => setSelectedToken("usdc")}
                className={[
                  "flex flex-1 items-center justify-center gap-2 rounded-[10px] py-2.5 text-[13px] font-medium transition",
                  selectedToken === "usdc"
                    ? "bg-white/[0.07] text-white/90"
                    : "text-white/30 hover:text-white/55",
                ].join(" ")}
              >
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><circle cx="10" cy="10" r="8"/><path d="M10 6v8M7 8.5h4.5a1.5 1.5 0 010 3H8.5a1.5 1.5 0 000 3H13"/></svg>
                USDC
              </button>
              <button
                type="button"
                onClick={() => setSelectedToken("native")}
                className={[
                  "flex flex-1 items-center justify-center gap-2 rounded-[10px] py-2.5 text-[13px] font-medium transition",
                  selectedToken === "native"
                    ? "bg-white/[0.07] text-white/90"
                    : "text-white/30 hover:text-white/55",
                ].join(" ")}
              >
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 2L4 12l8 5 8-5L12 2z" fill="currentColor" opacity="0.7"/><path d="M4 12l8 10 8-10" fill="currentColor" opacity="0.4"/></svg>
                {selectedChain.nativeSymbol}
              </button>
            </div>
          </div>

          {/* Results / empty state */}
          <div className="mt-6 flex-1 overflow-y-auto">
            {/* Empty — not typing yet */}
            {!isTyping && combined.length === 0 && (
              <p className="py-10 text-center text-[13px] text-white/30">Start typing to search</p>
            )}

            {/* No results after search */}
            {isTyping && !searchLoading && combined.length === 0 && (
              <p className="py-10 text-center text-[13px] text-white/30">
                {isPhoneQuery ? "No XPay account linked to that number" : "No users found"}
              </p>
            )}

            {/* Result rows */}
            {combined.length > 0 && (
              <div className="divide-y divide-white/[0.06]">
                {combined.map(p => {
                  const noWallet = isNativeSend && !p.walletAddress
                  return (
                    <button
                      key={p.username}
                      type="button"
                      disabled={noWallet}
                      onClick={() => { setXpayRecipient(p); setSuggestions([]); setStep("amount") }}
                      className={[
                        "flex w-full items-center gap-3 py-3.5 text-left transition",
                        noWallet
                          ? "cursor-not-allowed opacity-40"
                          : "hover:opacity-80 active:opacity-60",
                      ].join(" ")}
                    >
                      <Avatar name={p.displayName} size={40} src={p.avatarUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium text-white/85">{p.displayName}</p>
                        <p className="truncate text-[12px] text-white/35">{formatHandle(p.username)}</p>
                        {isNativeSend && !p.walletAddress && (
                          <p className="text-[12px] text-amber-500/80">No wallet — switch to USDC</p>
                        )}
                      </div>
                      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round"><path d="M6 4l4 4-4 4"/></svg>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </Screen>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RECIPIENT MODE (entry point)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <Screen back onBack={() => navigate(-1)} title="Send">
      <div className="flex flex-1 flex-col pt-4 pb-10">
        <Title sub="Choose how you want to send.">Send money</Title>

        <div className="mt-8 space-y-3">
          {/* XPay user — USDC or native */}
          <button type="button" onClick={() => setStep("xpay_lookup")}
            className="flex w-full items-center gap-4 rounded-2xl border border-white/[0.06] bg-black p-5 text-left shadow-sm transition hover:border-blue-200 hover:bg-emerald-500/10 active:scale-[.99]">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white/90">XPay user</p>
              <p className="mt-0.5 text-sm text-white/50">
                By username or phone ·{" "}
                <span className="font-medium text-emerald-400">USDC</span>
                <span className="text-white/40"> or </span>
                <span className="font-medium text-white/70">ETH</span>
              </p>
            </div>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4l6 6-6 6"/></svg>
          </button>

          {/* Send to Nigerian bank — USDC converted to NGN for bank payout */}
          <button type="button" onClick={() => navigate("/convert")}
            className="flex w-full items-center gap-4 rounded-2xl border border-white/[0.06] bg-black p-5 text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50/60 active:scale-[.99]">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ea580c" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4"/>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white/90">Nigerian bank account</p>
              <p className="mt-0.5 text-sm text-white/50">
                Any Nigerian bank ·{" "}
                <span className="font-medium text-orange-500">USDC → NGN</span>
              </p>
            </div>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4l6 6-6 6"/></svg>
          </button>

          {/* Crypto wallet — USDC or native */}
          <button type="button" onClick={() => setStep("wallet_address")}
            className="flex w-full items-center gap-4 rounded-2xl border border-white/[0.06] bg-black p-5 text-left shadow-sm transition hover:border-purple-200 hover:bg-purple-50 active:scale-[.99]">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#7c3aed" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8M16 11h.01"/>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white/90">Crypto wallet address</p>
              <p className="mt-0.5 text-sm text-white/50">
                <span className="font-medium text-emerald-400">USDC</span>
                <span className="text-white/40"> or </span>
                <span className="font-medium text-white/70">ETH / native token</span>
              </p>
            </div>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4l6 6-6 6"/></svg>
          </button>
        </div>
      </div>
    </Screen>
  )
}

/**
 * Swap page — swap tokens using the 0x Swap API (Permit2).
 * Uses the API's returned transaction data directly for execution.
 */

import { useEffect, useState, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useWallets } from "@privy-io/react-auth"
import { useSession } from "@/lib/session"
import { useNetwork } from "@/lib/NetworkContext"
import { NetworkSwitcher } from "@/components/NetworkSwitcher"
import { Screen, Title } from "@/components/Screen"
import { getTokenLogo } from "@/assets/logos"
import { fetchUsdcBalance, fetchEthBalance } from "@/lib/useUsdcBalance"
import type { ChainConfig } from "@/lib/NetworkContext"

// ─── Types ────────────────────────────────────────────────────────────────────

type SwapStep = "idle" | "signing" | "done" | "error"

interface Token {
  symbol: string
  name: string
  address: string | "native"
  decimals: number
}

interface SwapQuote {
  /** Raw output token amount (token decimals) */
  toAmount: bigint
  /** Human-readable route description */
  routeLabel: string
  /** Estimated price impact */
  priceImpact: string
  /** Which protocol was used */
  protocol: string
  /** Ready-to-send transaction from the API */
  tx: {
    to: string
    data: string
    value: string
    gasLimit: string
  }
  /** Permit2 signature request (present when selling ERC20) */
  permit2: {
    hash: string
    eip712: {
      types: Record<string, { name: string; type: string }[]>
      domain: Record<string, unknown>
      message: Record<string, unknown>
      primaryType: string
    }
  } | null
  /** Whether Permit2 allowance needs to be set first */
  needsAllowance: boolean
  /** Permit2 spender address */
  allowanceSpender: string | null
  /** The sell token (needed for approval tx) */
  sellToken: Token
  /** Raw sell amount (needed for approval tx) */
  sellAmountRaw: bigint
}

// ─── Token catalogue per chain ────────────────────────────────────────────────

const NATIVE = "native" as const
const NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000"

const CHAIN_TOKENS: Record<number, Token[]> = {
  // Ethereum Mainnet
  1: [
    { symbol: "ETH",  name: "Ether",        address: NATIVE,                                          decimals: 18 },
    { symbol: "USDC", name: "USD Coin",      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",   decimals: 6  },
    { symbol: "USDT", name: "Tether USD",    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",   decimals: 6  },
    { symbol: "WETH", name: "Wrapped ETH",   address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",   decimals: 18 },
    { symbol: "DAI",  name: "Dai",           address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",   decimals: 18 },
  ],
  // Sepolia testnet
  11155111: [
    { symbol: "ETH",  name: "Ether",    address: NATIVE,                                               decimals: 18 },
    { symbol: "USDC", name: "USD Coin", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",        decimals: 6  },
  ],
  // Base Mainnet
  8453: [
    { symbol: "ETH",  name: "Ether",        address: NATIVE,                                           decimals: 18 },
    { symbol: "USDC", name: "USD Coin",      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",   decimals: 6  },
    { symbol: "USDT", name: "Tether USD",    address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",   decimals: 6  },
    { symbol: "WETH", name: "Wrapped ETH",   address: "0x4200000000000000000000000000000000000006",   decimals: 18 },
    { symbol: "DAI",  name: "Dai",           address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",   decimals: 18 },
  ],
  // Base Sepolia testnet
  84532: [
    { symbol: "ETH",  name: "Ether",    address: NATIVE,                                               decimals: 18 },
    { symbol: "USDC", name: "USD Coin", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",        decimals: 6  },
  ],
}

// ─── 0x Swap API (Permit2) quote ─────────────────────────────────────────────

const ZERO_X_API_KEY = import.meta.env.VITE_0X_API_KEY as string

/** Chain-specific 0x base URLs */
function get0xBaseUrl(chainId: number): string {
  const urls: Record<number, string> = {
    1:        "https://api.0x.org",
    11155111: "https://api.0x.org",   // Sepolia uses mainnet endpoint with chainId param
    8453:     "https://api.0x.org",
    84532:    "https://api.0x.org",   // Base Sepolia
  }
  return urls[chainId] ?? "https://api.0x.org"
}

async function fetch0xQuote(params: {
  chain: ChainConfig
  sellToken: Token
  buyToken: Token
  sellAmountRaw: bigint
  takerAddress: string
}): Promise<SwapQuote> {
  const { chain, sellToken, buyToken, sellAmountRaw, takerAddress } = params

  const sellAddress = sellToken.address === NATIVE ? NATIVE_ADDRESS : sellToken.address
  const buyAddress  = buyToken.address  === NATIVE ? "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" : buyToken.address

  const url = new URL(`${get0xBaseUrl(chain.id)}/swap/permit2/quote`)
  url.searchParams.set("chainId",     String(chain.id))
  url.searchParams.set("sellToken",   sellAddress)
  url.searchParams.set("buyToken",    buyAddress)
  url.searchParams.set("sellAmount",  sellAmountRaw.toString())
  url.searchParams.set("taker",       takerAddress)
  url.searchParams.set("slippageBps", "50") // 0.5%

  const res = await fetch(url.toString(), {
    headers: {
      "0x-api-key": ZERO_X_API_KEY,
      "0x-version": "v2",
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; reason?: string }
    throw new Error(err.reason ?? err.message ?? `Quote failed (HTTP ${res.status})`)
  }

  const json = await res.json() as {
    buyAmount: string
    sellAmount: string
    minBuyAmount: string
    liquidityAvailable: boolean
    route: { fills: { source: string }[] }
    fees: { zeroExFee?: { amount: string; token: string } | null }
    issues?: { allowance?: { actual: string; spender: string } | null }
    permit2?: {
      hash: string
      eip712: {
        types: Record<string, { name: string; type: string }[]>
        domain: Record<string, unknown>
        message: Record<string, unknown>
        primaryType: string
      }
    } | null
    transaction: {
      to: string
      data: string
      value: string
      gas: string
      gasPrice: string
    }
  }

  if (!json.liquidityAvailable) {
    throw new Error("NO_ROUTE")
  }

  const toAmount = BigInt(json.buyAmount)
  const sources  = json.route.fills.map(f => f.source).filter((v, i, a) => a.indexOf(v) === i)
  const routeLabel  = sources.join(" + ") || "0x"
  const priceImpact = "< 0.5%"  // 0x doesn't return price impact directly

  const txData: SwapQuote["tx"] = {
    to:       json.transaction.to,
    data:     json.transaction.data,
    value:    json.transaction.value ?? "0x0",
    gasLimit: `0x${parseInt(json.transaction.gas).toString(16)}`,
  }

  // Carry permit2 and allowance issues through so executeSwap can handle them
  return {
    toAmount,
    routeLabel,
    priceImpact,
    protocol: routeLabel,
    tx: txData,
    permit2:   json.permit2 ?? null,
    needsAllowance: !!(json.issues?.allowance && BigInt(json.issues.allowance.actual) === 0n),
    allowanceSpender: json.issues?.allowance?.spender ?? null,
    sellToken,
    sellAmountRaw,
  }
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatTokenAmount(raw: bigint, decimals: number, maxDp = 6): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = raw / divisor
  const frac  = raw % divisor
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, maxDp).replace(/0+$/, "")
  return fracStr ? `${whole}.${fracStr}` : `${whole}`
}

function parseTokenAmount(input: string, decimals: number): bigint | null {
  const cleaned = input.trim().replace(/,/g, "")
  if (!cleaned || !/^\d*(\.\d*)?$/.test(cleaned)) return null
  const [whole = "0", frac = ""] = cleaned.split(".")
  if (frac.length > decimals) return null
  const padded = frac.padEnd(decimals, "0")
  const val = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded)
  return val > 0n ? val : null
}

// ─── Token selector modal ─────────────────────────────────────────────────────

function TokenSelector({
  tokens, selected, onSelect, exclude, onClose,
}: {
  tokens: Token[]
  selected: Token
  onSelect: (t: Token) => void
  exclude: Token
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[26.25rem] overflow-hidden rounded-t-3xl bg-black pb-10 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <p className="text-base font-bold text-white/90">Select token</p>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.07] text-white/50 hover:bg-gray-200 transition"
          >
            <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>
        <div className="divide-y divide-white/[0.06] px-3">
          {tokens.filter(t => t.symbol !== exclude.symbol).map(token => (
            <button
              key={token.symbol}
              onClick={() => { onSelect(token); onClose() }}
              className={[
                "flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition hover:bg-[#161618]",
                selected.symbol === token.symbol ? "bg-emerald-500/10" : "",
              ].join(" ")}
            >
              <TokenIcon token={token} size={38} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white/90">{token.symbol}</p>
                <p className="text-xs text-white/40">{token.name}</p>
              </div>
              {selected.symbol === token.symbol && (
                <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 7l3.5 3.5L12 3" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Token icon ───────────────────────────────────────────────────────────────

function TokenIcon({ token, size = 32 }: { token: Token; size?: number }) {
  const style = { width: size, height: size }
  if (token.symbol === "USDC") return <img src={getTokenLogo("USDC")} alt="USDC" style={style} className="rounded-full shrink-0" />
  if (token.symbol === "USDT") return <img src={getTokenLogo("USDT")} alt="USDT" style={style} className="rounded-full shrink-0" />
  const colours: Record<string, string> = {
    ETH: "#627EEA", WETH: "#627EEA", DAI: "#F5AC37", cbBTC: "#F7931A",
  }
  const bg = colours[token.symbol] ?? "#6b7280"
  return (
    <span
      style={{ ...style, backgroundColor: bg }}
      className="flex shrink-0 items-center justify-center rounded-full text-white font-bold text-xs"
    >
      {token.symbol.slice(0, 2)}
    </span>
  )
}

// ─── Main swap page ───────────────────────────────────────────────────────────

export default function Swap() {
  const navigate   = useNavigate()
  const { authUser, profile, loading } = useSession()
  const { activeChain } = useNetwork()
  const { wallets }     = useWallets()
  const embeddedWallet  = wallets.find(w => w.walletClientType === "privy")

  // ── Tokens ──────────────────────────────────────────────────────────────────
  const tokens = CHAIN_TOKENS[activeChain.id] ?? CHAIN_TOKENS[8453]
  const [fromToken, setFromToken] = useState<Token>(() => tokens[1] ?? tokens[0]) // USDC default
  const [toToken,   setToToken]   = useState<Token>(() => tokens[0])               // ETH default
  const [amountIn,  setAmountIn]  = useState("")

  // ── Token selectors ─────────────────────────────────────────────────────────
  const [showFromPicker, setShowFromPicker] = useState(false)
  const [showToPicker,   setShowToPicker]   = useState(false)

  // ── Balances ────────────────────────────────────────────────────────────────
  const [fromBalance, setFromBalance] = useState<bigint | null>(null)

  // ── Quote ───────────────────────────────────────────────────────────────────
  const [quote,        setQuote]        = useState<SwapQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError,   setQuoteError]   = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Execution ───────────────────────────────────────────────────────────────
  const [step,      setStep]      = useState<SwapStep>("idle")
  const [txHash,    setTxHash]    = useState<string | null>(null)
  const [execError, setExecError] = useState<string | null>(null)

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !authUser)            navigate("/", { replace: true })
    if (!loading && authUser && !profile) navigate("/onboarding", { replace: true })
  }, [loading, authUser, profile, navigate])

  // ── Reset tokens when chain changes ─────────────────────────────────────────
  useEffect(() => {
    const t = CHAIN_TOKENS[activeChain.id] ?? CHAIN_TOKENS[8453]
    setFromToken(t[1] ?? t[0])
    setToToken(t[0])
    setAmountIn("")
    setQuote(null)
    setQuoteError(null)
  }, [activeChain.id])

  // ── Fetch from-token balance ─────────────────────────────────────────────────
  useEffect(() => {
    if (!embeddedWallet?.address) return
    setFromBalance(null)
    const addr = embeddedWallet.address
    void (async () => {
      try {
        if (fromToken.address === NATIVE) {
          setFromBalance(await fetchEthBalance(addr, activeChain))
        } else if (fromToken.symbol === "USDC") {
          setFromBalance(await fetchUsdcBalance(addr, activeChain))
        } else {
          setFromBalance(null)
        }
      } catch { setFromBalance(null) }
    })()
  }, [embeddedWallet?.address, fromToken, activeChain])

  // ── Debounced quote fetch ────────────────────────────────────────────────────
  const doFetchQuote = useCallback(async () => {
    const amt = parseTokenAmount(amountIn, fromToken.decimals)
    if (!amt || !embeddedWallet?.address) return
    setQuoteLoading(true)
    setQuoteError(null)
    setQuote(null)
    try {
      const q = await fetch0xQuote({
        chain: activeChain,
        sellToken: fromToken,
        buyToken: toToken,
        sellAmountRaw: amt,
        takerAddress: embeddedWallet.address,
      })
      setQuote(q)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not get quote."
      setQuoteError(
        msg.includes("NO_ROUTE") || msg.includes("INSUFFICIENT_LIQUIDITY") || msg.includes("liquidityAvailable")
          ? "No liquidity available for this pair on this network. Try switching to mainnet."
          : msg.includes("429") || msg.includes("rate")
          ? "Rate limited. Please wait a moment and try again."
          : msg
      )
    } finally {
      setQuoteLoading(false)
    }
  }, [amountIn, fromToken, toToken, activeChain, embeddedWallet])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const amt = parseTokenAmount(amountIn, fromToken.decimals)
    if (!amt) { setQuote(null); setQuoteError(null); return }
    debounceRef.current = setTimeout(() => void doFetchQuote(), 800)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [amountIn, fromToken, toToken, doFetchQuote])

  // ── Flip tokens ─────────────────────────────────────────────────────────────
  function flipTokens() {
    setFromToken(prev => {
      setToToken(prev)
      return toToken
    })
    setAmountIn("")
    setQuote(null)
    setQuoteError(null)
  }

  // ── Set max ──────────────────────────────────────────────────────────────────
  function setMax() {
    if (fromBalance === null) return
    // Leave a small buffer for gas if selling ETH
    if (fromToken.address === NATIVE && fromBalance > 0n) {
      const gasBuffer = 2000000000000000n // 0.002 ETH
      const safe = fromBalance > gasBuffer ? fromBalance - gasBuffer : fromBalance
      setAmountIn(formatTokenAmount(safe, fromToken.decimals))
    } else {
      setAmountIn(formatTokenAmount(fromBalance, fromToken.decimals))
    }
  }

  // ── Execute swap ─────────────────────────────────────────────────────────────
  async function executeSwap() {
    if (!quote || !embeddedWallet) return
    setStep("signing")
    setExecError(null)
    try {
      const provider = await embeddedWallet.getEthereumProvider()

      // Switch to the correct chain
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${activeChain.id.toString(16)}` }],
        })
      } catch { /* already on correct chain */ }

      // ── Step 1: If Permit2 allowance not set, approve it first (one-time) ──
      if (quote.needsAllowance && quote.allowanceSpender && quote.sellToken.address !== NATIVE) {
        const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3"
        // approve(PERMIT2, type(uint256).max)
        const approveData =
          "0x095ea7b3" +
          PERMIT2.slice(2).toLowerCase().padStart(64, "0") +
          "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
        await provider.request({
          method: "eth_sendTransaction",
          params: [{
            from: embeddedWallet.address,
            to:   quote.sellToken.address as string,
            data: approveData,
            value: "0x0",
          }],
        })
        // Small wait to let the approval confirm before the swap
        await new Promise(r => setTimeout(r, 3000))
      }

      // ── Step 2: Sign Permit2 typed data (for ERC20 sells) ──────────────────
      let txData = quote.tx.data
      if (quote.permit2?.eip712) {
        const signature = await provider.request({
          method: "eth_signTypedData_v4",
          params: [embeddedWallet.address, JSON.stringify(quote.permit2.eip712)],
        }) as string

        // Append signature length + signature to the tx data (0x convention)
        const sigLenHex = (signature.length / 2 - 1).toString(16).padStart(64, "0")
        txData = quote.tx.data + sigLenHex + signature.slice(2)
      }

      // ── Step 3: Send the swap transaction ───────────────────────────────────
      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from:  embeddedWallet.address,
          to:    quote.tx.to,
          data:  txData,
          value: quote.tx.value,
          gas:   quote.tx.gasLimit,
        }],
      }) as string

      setTxHash(hash)
      setStep("done")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed."
      setExecError(
        msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("cancel")
          ? "You cancelled the transaction."
          : msg.toLowerCase().includes("insufficient funds")
          ? "Insufficient funds for gas. Make sure you have enough ETH for transaction fees."
          : msg
      )
      setStep("error")
    }
  }

  if (!profile) return <div className="min-h-dvh bg-[#1a1a1c]" />

  // Derived values
  const parsedAmount        = parseTokenAmount(amountIn, fromToken.decimals)
  const outputAmount        = quote ? formatTokenAmount(quote.toAmount, toToken.decimals) : ""
  const maxBalanceLabel     = fromBalance !== null ? formatTokenAmount(fromBalance, fromToken.decimals) : null
  const insufficientBalance = parsedAmount !== null && fromBalance !== null && parsedAmount > fromBalance
  const canSwap             = !!quote && !quoteLoading && !insufficientBalance && step !== "signing"

  // ── Done screen ──────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <Screen back onBack={() => { setStep("idle"); setAmountIn(""); setQuote(null); setTxHash(null) }}>
        <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center gap-5">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
            <svg viewBox="0 0 40 40" width="40" height="40" fill="none">
              <circle cx="20" cy="20" r="20" fill="#10b981" opacity="0.15" />
              <path d="M10 20l7 7 13-14" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="text-xl font-bold text-white/90">Swap submitted!</p>
            <p className="mt-1 text-sm text-white/50">
              {amountIn} {fromToken.symbol} → ≈{outputAmount} {toToken.symbol}
            </p>
          </div>
          {txHash && (
            <a
              href={`${activeChain.blockExplorer}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-blue-100 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-blue-100"
            >
              View on explorer
              <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 10L10 2M5 2h5v5" />
              </svg>
            </a>
          )}
          <button
            onClick={() => { setStep("idle"); setAmountIn(""); setQuote(null); setTxHash(null) }}
            className="mt-2 rounded-2xl bg-emerald-500 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-400"
          >
            Swap again
          </button>
          <button onClick={() => navigate("/home")} className="text-sm text-white/40 hover:text-white/60">
            Back to home
          </button>
        </div>
      </Screen>
    )
  }

  // ── Error screen ─────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <Screen back onBack={() => setStep("idle")}>
        <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
            <svg viewBox="0 0 40 40" width="40" height="40" fill="none">
              <circle cx="20" cy="20" r="20" fill="#ef4444" opacity="0.15" />
              <path d="M14 14l12 12M26 14L14 26" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-lg font-bold text-white/90">Swap failed</p>
          <p className="text-sm text-white/50 max-w-[280px]">{execError}</p>
          <button
            onClick={() => setStep("idle")}
            className="mt-2 rounded-2xl bg-emerald-500 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-400"
          >
            Try again
          </button>
        </div>
      </Screen>
    )
  }

  // ── Main UI ──────────────────────────────────────────────────────────────────
  return (
    <Screen back onBack={() => navigate("/home")} action={<NetworkSwitcher />}>
      <div className="flex flex-1 flex-col pt-4 pb-12 gap-4">
        <Title sub={`Swap tokens on ${activeChain.name} via Uniswap`}>Swap</Title>

        {/* ── Swap card ─────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-black shadow-sm">

          {/* You pay */}
          <div className="px-4 pt-5 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/40">You pay</p>
              {maxBalanceLabel !== null && (
                <button
                  onClick={setMax}
                  className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-blue-100 transition"
                >
                  Max: {maxBalanceLabel} {fromToken.symbol}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountIn}
                onChange={e => { if (/^\d*\.?\d*$/.test(e.target.value)) setAmountIn(e.target.value) }}
                className="min-w-0 flex-1 bg-transparent text-3xl font-bold text-white/90 outline-none placeholder-gray-200"
              />
              <button
                onClick={() => setShowFromPicker(true)}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-white/[0.08] bg-[#161618] px-3 py-2.5 transition hover:bg-white/[0.07] active:scale-95"
              >
                <TokenIcon token={fromToken} size={24} />
                <span className="text-sm font-bold text-white/90">{fromToken.symbol}</span>
                <svg viewBox="0 0 10 10" width="8" height="8" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3.5l3 3 3-3" />
                </svg>
              </button>
            </div>
            {insufficientBalance && (
              <p className="mt-2 text-xs font-medium text-red-500">Insufficient balance</p>
            )}
          </div>

          {/* Flip divider */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-x-0 top-1/2 border-t border-white/[0.06]" />
            <button
              onClick={flipTokens}
              className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-black shadow-sm transition hover:border-blue-300 hover:bg-emerald-500/10 active:scale-90"
              aria-label="Flip tokens"
            >
              {/* Simple up/down arrows — clear swap icon */}
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 3L5 13M5 3L2 6M5 3L8 6" />
                <path d="M11 13L11 3M11 13L8 10M11 13L14 10" />
              </svg>
            </button>
          </div>

          {/* You receive */}
          <div className="px-4 pt-4 pb-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">You receive</p>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                {quoteLoading
                  ? <div className="h-9 w-36 animate-pulse rounded-xl bg-white/[0.07]" />
                  : outputAmount
                    ? <p className="text-3xl font-bold text-white/90">≈{outputAmount}</p>
                    : <p className="text-3xl font-bold text-gray-200">0.00</p>
                }
              </div>
              <button
                onClick={() => setShowToPicker(true)}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-white/[0.08] bg-[#161618] px-3 py-2.5 transition hover:bg-white/[0.07] active:scale-95"
              >
                <TokenIcon token={toToken} size={24} />
                <span className="text-sm font-bold text-white/90">{toToken.symbol}</span>
                <svg viewBox="0 0 10 10" width="8" height="8" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3.5l3 3 3-3" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── Quote details ─────────────────────────────────────────────── */}
        {quote && !quoteLoading && (
          <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-black shadow-sm">
            <div className="divide-y divide-white/[0.06]">
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-xs text-white/50">Route</p>
                <p className="text-xs font-semibold text-white/90">{quote.routeLabel}</p>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-xs text-white/50">Price impact</p>
                <p className={`text-xs font-semibold ${parseFloat(quote.priceImpact) > 1 ? "text-amber-600" : "text-white/90"}`}>
                  {quote.priceImpact}
                </p>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-xs text-white/50">Slippage</p>
                <p className="text-xs font-semibold text-white/90">0.5%</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Quote error ───────────────────────────────────────────────── */}
        {quoteError && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3.5">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
              <circle cx="8" cy="8" r="6" /><path d="M8 5v3M8 10.5v.5" />
            </svg>
            <p className="text-xs text-red-700 leading-relaxed">{quoteError}</p>
          </div>
        )}

        {/* ── Testnet notice ────────────────────────────────────────────── */}
        {activeChain.isTestnet && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3.5">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
              <path d="M8 1l7 13H1L8 1z" /><path d="M8 6v4M8 11.5v.5" />
            </svg>
            <p className="text-xs text-amber-700 leading-relaxed">
              <strong>Testnet mode.</strong> Uniswap liquidity is very limited on {activeChain.name}. Switch to Ethereum or Base mainnet for live swaps.
            </p>
          </div>
        )}

        {/* ── Swap button ───────────────────────────────────────────────── */}
        <button
          disabled={!canSwap}
          onClick={executeSwap}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-sm font-bold text-white shadow-sm shadow-blue-200 transition hover:bg-emerald-400 active:scale-[.98] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {step === "signing" ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Confirm in wallet…
            </>
          ) : !parsedAmount ? (
            "Enter an amount"
          ) : insufficientBalance ? (
            "Insufficient balance"
          ) : quoteLoading ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Getting quote…
            </>
          ) : quote ? (
            `Swap ${amountIn} ${fromToken.symbol} → ≈${outputAmount} ${toToken.symbol}`
          ) : (
            "Enter an amount"
          )}
        </button>

        <p className="text-center text-[10px] text-white/30">
          Powered by 0x
        </p>
      </div>

      {/* Token pickers */}
      {showFromPicker && (
        <TokenSelector
          tokens={tokens}
          selected={fromToken}
          exclude={toToken}
          onSelect={t => { setFromToken(t); setAmountIn(""); setQuote(null) }}
          onClose={() => setShowFromPicker(false)}
        />
      )}
      {showToPicker && (
        <TokenSelector
          tokens={tokens}
          selected={toToken}
          exclude={fromToken}
          onSelect={t => { setToToken(t); setAmountIn(""); setQuote(null) }}
          onClose={() => setShowToPicker(false)}
        />
      )}
    </Screen>
  )
}

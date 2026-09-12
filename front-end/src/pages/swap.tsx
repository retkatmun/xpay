/**
 * Swap page — swap tokens using the Uniswap Trade API.
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

// ─── Universal Router addresses ───────────────────────────────────────────────

function getUniversalRouter(chainId: number): string {
  const routers: Record<number, string> = {
    1:        "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
    11155111: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
    8453:     "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
    84532:    "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
  }
  return routers[chainId] ?? routers[1]
}

function getWeth(chainId: number): string {
  const weth: Record<number, string> = {
    1:        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    11155111: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    8453:     "0x4200000000000000000000000000000000000006",
    84532:    "0x4200000000000000000000000000000000000006",
  }
  return weth[chainId] ?? weth[1]
}

// ─── ABI encoding helpers ─────────────────────────────────────────────────────

function padHex(val: bigint | number | string, bytes = 32): string {
  const hex = typeof val === "string"
    ? val.replace("0x", "")
    : BigInt(val).toString(16)
  return hex.padStart(bytes * 2, "0")
}

function encodeAddress(addr: string): string {
  return padHex(addr.replace("0x", "").toLowerCase())
}

// ─── Calldata builder (Uniswap V3 exactInputSingle via UniversalRouter) ───────

function buildSwapCalldata(p: {
  sellToken: Token
  buyToken: Token
  sellAmountRaw: bigint
  toAmount: bigint
  takerAddress: string
  chain: ChainConfig
  slippage: bigint // bps (50 = 0.5%)
}): string {
  const { sellToken, buyToken, sellAmountRaw, toAmount, takerAddress, chain, slippage } = p

  const isEthIn  = sellToken.address === NATIVE
  const isEthOut = buyToken.address  === NATIVE
  const WETH = getWeth(chain.id)

  const tokenIn  = isEthIn  ? WETH : (sellToken.address as string)
  const tokenOut = isEthOut ? WETH : (buyToken.address  as string)

  const minOut = toAmount - (toAmount * slippage / 10000n)

  const recipient = isEthOut
    ? "0x0000000000000000000000000000000000000002"
    : takerAddress

  const isStablePair =
    (sellToken.symbol === "USDC" || sellToken.symbol === "USDT" || sellToken.symbol === "DAI") &&
    (buyToken.symbol  === "USDC" || buyToken.symbol  === "USDT" || buyToken.symbol  === "DAI")
  const fee = isStablePair ? 500n : 3000n

  const path =
    tokenIn.replace("0x", "").toLowerCase() +
    padHex(fee, 3) +
    tokenOut.replace("0x", "").toLowerCase()

  const payerIsUser = isEthIn ? 0 : 1

  const v3Inputs =
    encodeAddress(recipient) +
    padHex(sellAmountRaw) +
    padHex(minOut) +
    padHex(0xa0) +
    padHex(payerIsUser) +
    padHex(path.length / 2) +
    path.padEnd(Math.ceil(path.length / 64) * 64, "0")

  const unwrapInputs = isEthOut
    ? encodeAddress(takerAddress) + padHex(minOut)
    : ""

  let commands = ""
  const inputSegments: string[] = []

  if (isEthIn) {
    commands += "0b"
    const wrapInputs = encodeAddress("0x0000000000000000000000000000000000000002") + padHex(sellAmountRaw)
    inputSegments.push(wrapInputs)
  }

  commands += "00"
  inputSegments.push(v3Inputs)

  if (isEthOut) {
    commands += "0c"
    inputSegments.push(unwrapInputs)
  }

  const selector = "3593564c"
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800)

  const numCommands = commands.length / 2
  const cmdLen32 = Math.ceil(numCommands / 32) * 32
  const offsetInputs = 0x60 + 0x20 + cmdLen32

  let encoded = ""
  encoded += padHex(0x60)
  encoded += padHex(offsetInputs)
  encoded += padHex(deadline)
  encoded += padHex(numCommands)
  encoded += commands.padEnd(cmdLen32 * 2, "0")

  const numInputs = inputSegments.length
  encoded += padHex(numInputs)

  let innerOffset = numInputs * 32
  const offsets: number[] = []
  const encodedInputs: string[] = []

  for (const seg of inputSegments) {
    offsets.push(innerOffset)
    const segLen = seg.length / 2
    const segPadded = seg.padEnd(Math.ceil(segLen / 32) * 32 * 2, "0")
    encodedInputs.push(padHex(segLen) + segPadded)
    innerOffset += 32 + segPadded.length / 2
  }

  for (const off of offsets) encoded += padHex(off)
  for (const inp of encodedInputs) encoded += inp

  return "0x" + selector + encoded
}

// ─── Uniswap Trade API quote ──────────────────────────────────────────────────

async function fetchUniswapQuote(params: {
  chain: ChainConfig
  sellToken: Token
  buyToken: Token
  sellAmountRaw: bigint
  takerAddress: string
}): Promise<SwapQuote> {
  const { chain, sellToken, buyToken, sellAmountRaw, takerAddress } = params

  const sellAddress = sellToken.address === NATIVE ? NATIVE_ADDRESS : sellToken.address
  const buyAddress  = buyToken.address  === NATIVE ? NATIVE_ADDRESS : buyToken.address

  const body = {
    type: "EXACT_INPUT",
    amount: sellAmountRaw.toString(),
    inputToken: {
      chainId: chain.id,
      address: sellAddress,
      decimals: sellToken.decimals,
      symbol: sellToken.symbol,
    },
    outputToken: {
      chainId: chain.id,
      address: buyAddress,
      decimals: buyToken.decimals,
      symbol: buyToken.symbol,
    },
    swapper: takerAddress,
    slippageTolerance: "0.5",
  }

  const res = await fetch("https://trade-api.gateway.uniswap.org/v2/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string; errorCode?: string }
    throw new Error(err.detail ?? err.errorCode ?? `Quote failed (HTTP ${res.status})`)
  }

  const json = await res.json() as {
    quote: {
      output: { amount: string }
      priceImpact?: number
      routeString?: string
    }
    routing: string
    transaction?: {
      to: string
      data: string
      value: string
      gasLimit?: string
      gas?: string
    }
  }

  const toAmount = BigInt(json.quote.output.amount)
  const priceImpact = json.quote.priceImpact != null
    ? `${json.quote.priceImpact.toFixed(2)}%`
    : "< 0.01%"

  const routingLabel =
    json.routing === "DUTCH_LIMIT" || json.routing === "DUTCH_V2"
      ? "UniswapX"
      : json.quote.routeString ?? "Uniswap V3"

  const protocolLabel =
    json.routing === "DUTCH_LIMIT" || json.routing === "DUTCH_V2"
      ? "UniswapX"
      : "Uniswap V3"

  // Prefer the API's ready-made transaction; fall back to manual calldata
  let txData: SwapQuote["tx"]
  if (json.transaction?.to && json.transaction?.data) {
    txData = {
      to:       json.transaction.to,
      data:     json.transaction.data,
      value:    json.transaction.value ?? (sellToken.address === NATIVE ? `0x${sellAmountRaw.toString(16)}` : "0x0"),
      gasLimit: json.transaction.gasLimit ?? json.transaction.gas ?? "0x493E0",
    }
  } else {
    // Fallback: build calldata manually
    const calldata = buildSwapCalldata({
      sellToken,
      buyToken,
      sellAmountRaw,
      toAmount,
      takerAddress,
      chain,
      slippage: 50n,
    })
    txData = {
      to:       getUniversalRouter(chain.id),
      data:     calldata,
      value:    sellToken.address === NATIVE ? `0x${sellAmountRaw.toString(16)}` : "0x0",
      gasLimit: "0x493E0",
    }
  }

  return { toAmount, routeLabel: routingLabel, priceImpact, protocol: protocolLabel, tx: txData }
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
        className="w-full max-w-[26.25rem] overflow-hidden rounded-t-3xl bg-white pb-10 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <p className="text-base font-bold text-gray-900">Select token</p>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition"
          >
            <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>
        <div className="divide-y divide-gray-100 px-3">
          {tokens.filter(t => t.symbol !== exclude.symbol).map(token => (
            <button
              key={token.symbol}
              onClick={() => { onSelect(token); onClose() }}
              className={[
                "flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition hover:bg-gray-50",
                selected.symbol === token.symbol ? "bg-blue-50" : "",
              ].join(" ")}
            >
              <TokenIcon token={token} size={38} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{token.symbol}</p>
                <p className="text-xs text-gray-400">{token.name}</p>
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
      const q = await fetchUniswapQuote({
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
        msg.includes("NO_ROUTE") || msg.includes("INSUFFICIENT_LIQUIDITY")
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

      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${activeChain.id.toString(16)}` }],
        })
      } catch { /* already on correct chain */ }

      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from:  embeddedWallet.address,
          to:    quote.tx.to,
          data:  quote.tx.data,
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

  if (!profile) return <div className="min-h-dvh bg-white" />

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
            <p className="text-xl font-bold text-gray-900">Swap submitted!</p>
            <p className="mt-1 text-sm text-gray-500">
              {amountIn} {fromToken.symbol} → ≈{outputAmount} {toToken.symbol}
            </p>
          </div>
          {txHash && (
            <a
              href={`${activeChain.blockExplorer}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-600 transition hover:bg-blue-100"
            >
              View on explorer
              <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 10L10 2M5 2h5v5" />
              </svg>
            </a>
          )}
          <button
            onClick={() => { setStep("idle"); setAmountIn(""); setQuote(null); setTxHash(null) }}
            className="mt-2 rounded-2xl bg-blue-600 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Swap again
          </button>
          <button onClick={() => navigate("/home")} className="text-sm text-gray-400 hover:text-gray-600">
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
          <p className="text-lg font-bold text-gray-900">Swap failed</p>
          <p className="text-sm text-gray-500 max-w-[280px]">{execError}</p>
          <button
            onClick={() => setStep("idle")}
            className="mt-2 rounded-2xl bg-blue-600 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-700"
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
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

          {/* You pay */}
          <div className="px-4 pt-5 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">You pay</p>
              {maxBalanceLabel !== null && (
                <button
                  onClick={setMax}
                  className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-100 transition"
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
                className="min-w-0 flex-1 bg-transparent text-3xl font-bold text-gray-900 outline-none placeholder-gray-200"
              />
              <button
                onClick={() => setShowFromPicker(true)}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 transition hover:bg-gray-100 active:scale-95"
              >
                <TokenIcon token={fromToken} size={24} />
                <span className="text-sm font-bold text-gray-900">{fromToken.symbol}</span>
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
            <div className="absolute inset-x-0 top-1/2 border-t border-gray-100" />
            <button
              onClick={flipTokens}
              className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition hover:border-blue-300 hover:bg-blue-50 active:scale-90"
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
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">You receive</p>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                {quoteLoading
                  ? <div className="h-9 w-36 animate-pulse rounded-xl bg-gray-100" />
                  : outputAmount
                    ? <p className="text-3xl font-bold text-gray-900">≈{outputAmount}</p>
                    : <p className="text-3xl font-bold text-gray-200">0.00</p>
                }
              </div>
              <button
                onClick={() => setShowToPicker(true)}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 transition hover:bg-gray-100 active:scale-95"
              >
                <TokenIcon token={toToken} size={24} />
                <span className="text-sm font-bold text-gray-900">{toToken.symbol}</span>
                <svg viewBox="0 0 10 10" width="8" height="8" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3.5l3 3 3-3" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── Quote details ─────────────────────────────────────────────── */}
        {quote && !quoteLoading && (
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="divide-y divide-gray-100">
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-xs text-gray-500">Route</p>
                <p className="text-xs font-semibold text-gray-900">{quote.routeLabel}</p>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-xs text-gray-500">Price impact</p>
                <p className={`text-xs font-semibold ${parseFloat(quote.priceImpact) > 1 ? "text-amber-600" : "text-gray-900"}`}>
                  {quote.priceImpact}
                </p>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-xs text-gray-500">Slippage</p>
                <p className="text-xs font-semibold text-gray-900">0.5%</p>
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
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-sm font-bold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 active:scale-[.98] disabled:opacity-40 disabled:cursor-not-allowed"
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

        <p className="text-center text-[10px] text-gray-300">
          Powered by Uniswap
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

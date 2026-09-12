import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "@/lib/session";
import { Avatar } from "@/components/Avatar";
import { CopyButton } from "@/components/CopyButton";
import { formatUSD } from "@/lib/money";
import { dayLabel } from "@/lib/time";
import { statusLabel, statusColor } from "@/lib/txStatus";
import { getTokenLogo } from "@/assets/logos";
import type { Transaction } from "@/lib/types";
import { getTransactions } from "@/lib/api";
import { useWalletBalances } from "@/lib/useUsdcBalance";
import { useOnChainTxs, type OnChainTx } from "@/lib/useOnChainTxs";
import { useNetwork } from "@/lib/NetworkContext";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import xpayLogo from "@/assets/xpay_logo.png";

const BALANCE_VISIBLE_KEY = "xpay_balance_visible"

function readBalanceVisible(): boolean {
  try {
    const raw = localStorage.getItem(BALANCE_VISIBLE_KEY)
    if (raw !== null) return raw !== "false"
  } catch { /* ignore */ }
  return true
}

// ─── Eye icons ────────────────────────────────────────────────────────────────
function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/>
      <circle cx="10" cy="10" r="2.5"/>
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.875 13.875A8.963 8.963 0 0110 15c-5.5 0-9-5-9-5a16.47 16.47 0 014.125-4.125M8.25 4.135A8.963 8.963 0 0110 4c5.5 0 9 5 9 5a16.47 16.47 0 01-2.1 2.773M3 3l14 14"/>
      <path d="M11.768 11.768A2.5 2.5 0 018.232 8.232"/>
    </svg>
  );
}

// ─── Tx row ───────────────────────────────────────────────────────────────────
function TxRow({ tx, last }: { tx: Transaction; last: boolean }) {
  const navigate = useNavigate();
  const out = tx.direction === "out";
  const usd = BigInt(tx.amount);
  const ngn = BigInt(tx.ngnAmount);

  return (
    <button
      onClick={() => navigate(`/activity/${tx.id}`)}
      className={[
        "flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-gray-50 active:bg-gray-100",
        !last ? "border-b border-gray-100" : "",
      ].join(" ")}
    >
      <div className="relative shrink-0">
        {tx.recipientType === "bank_account" ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
            </svg>
          </div>
        ) : (
          <Avatar name={tx.recipientDisplayName} size={40} />
        )}
        <span className={`absolute -right-0.5 -bottom-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full text-[8px] font-bold text-white ${out ? "bg-gray-400" : "bg-blue-500"}`}>
          {out ? "↑" : "↓"}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{tx.recipientDisplayName}</p>
        <p className={`text-xs ${statusColor(tx.status)}`}>{statusLabel(tx.status)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-semibold tabular-nums ${out ? "text-gray-800" : "text-blue-600"}`}>
          {out ? "−" : "+"}{formatUSD(usd)}
        </p>
        {ngn > 0n && (
          <p className="text-xs text-gray-400 tabular-nums">₦{ngn.toLocaleString("en-NG")}</p>
        )}
      </div>
    </button>
  );
}

// ─── On-chain tx row ──────────────────────────────────────────────────────────
function OnChainTxRow({ tx, last, nativeSymbol }: { tx: OnChainTx; last: boolean; nativeSymbol: string }) {
  const isIn = tx.type === "eth_in" || tx.type === "usdc_in"

  const valueLabel = tx.asset === "ETH"
    ? `${(Number(tx.value) / 1e18).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })} ${nativeSymbol}`
    : formatUSD(tx.value)

  return (
    <a
      href={tx.explorerUrl}
      target="_blank"
      rel="noreferrer"
      className={[
        "flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-gray-50 active:bg-gray-100",
        !last ? "border-b border-gray-100" : "",
      ].join(" ")}
    >
      <div className="relative shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-50">
          {tx.asset === "ETH" ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path d="M12 2L4 12l8 5 8-5L12 2z" fill="#627EEA" opacity="0.9"/>
              <path d="M4 12l8 10 8-10" fill="#627EEA" opacity="0.5"/>
            </svg>
          ) : (
            <img src={getTokenLogo("USDC")} alt="USDC" className="h-6 w-6 rounded-full" />
          )}
        </div>
        <span className={`absolute -right-0.5 -bottom-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full text-[8px] font-bold text-white ${isIn ? "bg-blue-500" : "bg-gray-400"}`}>
          {isIn ? "↓" : "↑"}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {isIn ? `Received ${tx.asset === "ETH" ? nativeSymbol : tx.asset}` : `Sent ${tx.asset === "ETH" ? nativeSymbol : tx.asset}`}
        </p>
        <p className="text-xs text-gray-400">{tx.counterpart}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-semibold tabular-nums ${isIn ? "text-blue-600" : "text-gray-800"}`}>
          {isIn ? "+" : "−"}{valueLabel}
        </p>
        <p className="text-[10px] text-gray-400">on-chain</p>
      </div>
    </a>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatEth(wei: bigint): string {
  const eth = Number(wei) / 1e18
  if (eth === 0) return "0 ETH"
  if (eth < 0.0001) return "< 0.0001 ETH"
  return `${eth.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })} ETH`
}

// ─── Main home ────────────────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate();
  const { authUser, profile, loading, walletAddress, isAdmin } = useSession();
  const { activeChain } = useNetwork();
  const { usdc: usdcBalance, eth: ethBalance, loading: balanceLoading, refresh: refreshBalance } = useWalletBalances(activeChain);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(readBalanceVisible);
  const [refreshing, setRefreshing] = useState(false);
  const lastChainId = useRef<number>(activeChain.id);

  // on-chain txs (ETH + USDC from explorer)
  const effectiveWallet = walletAddress || profile?.wallet_address || null;
  const { txs: onChainTxs, loading: _onChainLoading, refresh: refreshOnChain } = useOnChainTxs(effectiveWallet, activeChain);

  const toggleBalanceVisible = () => {
    setBalanceVisible(v => {
      const next = !v
      try { localStorage.setItem(BALANCE_VISIBLE_KEY, String(next)) } catch { /* ignore */ }
      return next
    })
  }

  // ── fetch XPay transactions ───────────────────────────────────────────────
  const fetchTx = useCallback(async (silent = false) => {
    if (!profile) return;
    if (!silent) setTransactions(null);
    setTxLoading(true);
    try {
      const txs = await getTransactions(authUser?.id);
      setTransactions(txs);
    } catch {
      setTransactions([]);
    } finally {
      setTxLoading(false);
    }
  }, [profile, authUser?.id]);

  // ── manual refresh (balance + transactions) ───────────────────────────────
  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.all([refreshBalance(), fetchTx(true), refreshOnChain()]);
    setRefreshing(false);
  }, [refreshing, refreshBalance, fetchTx, refreshOnChain]);

  useEffect(() => {
    if (!loading && !authUser) navigate("/login", { replace: true });
    if (!loading && authUser && !profile) navigate("/onboarding", { replace: true });
  }, [loading, authUser, profile, navigate]);

  // ── initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (profile) void fetchTx();
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── silent refresh on network switch ─────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    if (activeChain.id === lastChainId.current) return;
    lastChainId.current = activeChain.id;
    void fetchTx(true);
  }, [activeChain.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !authUser || !profile) return <div className="min-h-dvh bg-white" />;

  const usdcAmount = usdcBalance;
  const displayName = profile.display_name || profile.username;

  // ── Determine primary balance display ────────────────────────────────────
  // Show ETH balance as primary when USDC is zero/null and ETH exists,
  // or always show ETH as secondary if it exists
  const isEthChain = activeChain.nativeSymbol === "ETH";

  // ── Merge XPay txs + on-chain txs into a unified feed ────────────────────
  type FeedItem =
    | { kind: "xpay"; tx: Transaction; ts: number }
    | { kind: "onchain"; tx: OnChainTx; ts: number }

  const feedItems: FeedItem[] = [
    ...(transactions ?? []).map(tx => ({
      kind: "xpay" as const,
      tx,
      ts: new Date(tx.createdAt).getTime(),
    })),
    ...onChainTxs.map(tx => ({
      kind: "onchain" as const,
      tx,
      ts: tx.timestamp * 1000,
    })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 10)

  // Group by date label
  const groups: { label: string; items: FeedItem[] }[] = []
  const groupMap = new Map<string, FeedItem[]>()
  for (const item of feedItems) {
    const k = dayLabel(new Date(item.ts).toISOString())
    const arr = groupMap.get(k)
    if (arr) arr.push(item); else groupMap.set(k, [item])
  }
  for (const [label, items] of groupMap) groups.push({ label, items })

  return (
    <div className="min-h-dvh bg-white">
      {/* ── Fixed top navbar ── */}
      <nav className="fixed inset-x-0 top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[26.25rem] items-center justify-between px-5">
          {/* Logo */}
          <img src={xpayLogo} alt="XPay" className="h-7 w-auto object-contain" />
          {/* Right: network switcher + avatar */}
          <div className="flex items-center gap-2">
            <NetworkSwitcher />
            <Link
              to="/wallet"
              className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pr-1 pl-3 shadow-sm transition hover:border-gray-300"
            >
              <span className="text-xs font-medium text-gray-600">{displayName}</span>
              <Avatar name={displayName} size={26} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Scrollable body ── */}
      <div className="mx-auto w-full max-w-[26.25rem] px-5 pt-14">
        <main className="flex-1 pb-16">

          {/* ── Balance card ── */}
          <section className="mt-4">
            <div className="relative overflow-hidden rounded-2xl bg-blue-600 px-6 py-6 shadow-lg shadow-blue-200">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.06]"
                style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "20px 20px" }}
              />
              <div className="relative">
                {/* header row */}
                <div className="flex items-center justify-between">
                  <p className="text-[0.68rem] font-bold uppercase tracking-widest text-blue-200">Total balance</p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing || balanceLoading}
                      aria-label="Refresh balance and transactions"
                      className="flex items-center justify-center rounded-full p-1 text-blue-200 transition hover:text-white active:scale-90 disabled:opacity-50"
                    >
                      <svg
                        viewBox="0 0 20 20" width="15" height="15" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className={refreshing || balanceLoading ? "animate-spin" : ""}
                      >
                        <path d="M4 4a8 8 0 0112 0M16 16a8 8 0 01-12 0"/>
                        <path d="M2 10a8 8 0 001.5 4.7M18 10a8 8 0 01-1.5 4.7"/>
                        <path d="M17 6l-1-3-2 2M3 14l1 3 2-2"/>
                      </svg>
                    </button>
                    <button
                      onClick={toggleBalanceVisible}
                      className="flex items-center justify-center rounded-full p-1 text-blue-200 transition hover:text-white active:scale-90"
                      aria-label={balanceVisible ? "Hide balance" : "Show balance"}
                    >
                      {balanceVisible ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

                {/* USDC balance — primary */}
                <p className="mt-1.5 font-[var(--font-instrument-serif)] text-[2.8rem] leading-none tracking-[-0.03em] text-white tabular-nums">
                  {!balanceVisible
                    ? <span className="tracking-widest">••••••</span>
                    : (balanceLoading || refreshing)
                      ? <span className="inline-block h-9 w-32 animate-pulse rounded-xl bg-white/20 align-middle" />
                      : usdcAmount === null
                        ? <span className="opacity-30">$0.00</span>
                        : formatUSD(usdcAmount)}
                </p>

                {/* ETH balance — secondary row (shown when on ETH/Sepolia or when ETH > 0) */}
                {isEthChain && (
                  <div className="mt-1.5">
                    {balanceVisible && (
                      (balanceLoading || refreshing)
                        ? <span className="inline-block h-4 w-24 animate-pulse rounded-lg bg-white/20 align-middle" />
                        : ethBalance !== null
                          ? <p className="text-sm font-semibold text-blue-100 tabular-nums">
                              {formatEth(ethBalance)}
                            </p>
                          : <p className="text-sm text-blue-200/50">0 ETH</p>
                    )}
                  </div>
                )}

                {/* footer row */}
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <img src={getTokenLogo("USDC")} alt="USDC" className="h-4 w-4 rounded-full" />
                    <span className="text-xs font-semibold text-blue-200">USDC · {activeChain.name}</span>
                    {activeChain.isTestnet && (
                      <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-200">testnet</span>
                    )}
                  </div>
                  {(refreshing || txLoading) && (
                    <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-blue-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-200 animate-pulse" />
                      Updating
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ── Handle strip ── */}
          <section className="mt-2.5">
            <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5">
              <span className="text-xs text-gray-400">Your handle</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-semibold text-gray-700">{profile.username}.xpay</span>
                <CopyButton value={`${profile.username}.xpay`} label="Copy" />
              </div>
            </div>
          </section>

          {/* ── Action cards — 2×2 grid ── */}
          <section className="mt-5 grid grid-cols-2 gap-3">
            {/* Send */}
            <button
              onClick={() => navigate("/send")}
              className="group flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/60 active:scale-[.98]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-sm shadow-blue-200 transition group-hover:bg-blue-700">
                <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 10h14M13 5l5 5-5 5"/>
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Send money</p>
                <p className="mt-0.5 text-[11px] leading-tight text-gray-400">To users, banks, or wallets</p>
              </div>
            </button>

            {/* Receive */}
            <button
              onClick={() => navigate("/receive")}
              className="group flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-gray-200 hover:bg-gray-50 active:scale-[.98]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 transition group-hover:bg-gray-200">
                <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="#374151" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 10H3M7 15l-5-5 5-5"/>
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Receive money</p>
                <p className="mt-0.5 text-[11px] leading-tight text-gray-400">Share your handle or address</p>
              </div>
            </button>



            {/* Swap tokens */}
            <button
              onClick={() => navigate("/swap")}
              className="group flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-violet-200 hover:bg-violet-50/60 active:scale-[.98]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 transition group-hover:bg-violet-100">
                <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6h12M4 6l3-3M4 6l3 3M16 14H4M16 14l-3-3M16 14l-3 3"/>
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Swap tokens</p>
                <p className="mt-0.5 text-[11px] leading-tight text-gray-400">Swap via Uniswap</p>
              </div>
            </button>
          </section>

          {/* ── Assets / Wallet card ── */}
          <section className="mt-6">
            <h2 className="mb-3 text-[0.68rem] font-bold uppercase tracking-widest text-gray-400">Wallet</h2>
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              {/* Embedded wallet row */}
              {walletAddress && (
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: activeChain.color + "22" }}>
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: activeChain.color }} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Embedded wallet</p>
                      <p className="text-xs text-gray-400">{activeChain.name} · Privy</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold text-gray-600">
                      {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />Active
                    </span>
                  </div>
                </div>
              )}

              {/* USDC row */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
                <img src={getTokenLogo("USDC")} alt="USDC" className="h-9 w-9 rounded-full shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">USDC</p>
                  <p className="text-xs text-gray-400">USD Coin · {activeChain.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-gray-900">
                    {(balanceLoading || refreshing) ? (
                      <span className="h-3 w-14 inline-block animate-pulse rounded bg-gray-100" />
                    ) : usdcAmount !== null ? formatUSD(usdcAmount) : "$0.00"}
                  </p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">stablecoin</p>
                </div>
              </div>

              {/* ETH row — always show on ETH-native chains */}
              {isEthChain && (
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#627EEA]/10">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                      <path d="M12 2L4 12l8 5 8-5L12 2z" fill="#627EEA" opacity="0.9"/>
                      <path d="M4 12l8 10 8-10" fill="#627EEA" opacity="0.5"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{activeChain.nativeSymbol}</p>
                    <p className="text-xs text-gray-400">Native token · {activeChain.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-gray-900">
                      {(balanceLoading || refreshing) ? (
                        <span className="h-3 w-14 inline-block animate-pulse rounded bg-gray-100" />
                      ) : ethBalance !== null
                        ? formatEth(ethBalance)
                        : `0 ${activeChain.nativeSymbol}`}
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">native</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ── Admin panel ── */}
          {isAdmin && (
            <section className="mt-3">
              <button
                onClick={() => navigate("/admin")}
                className="flex w-full items-center gap-3 rounded-2xl border border-purple-100 bg-purple-50 px-4 py-3.5 text-left shadow-sm transition hover:bg-purple-100 active:scale-[.98]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-600">
                  <svg viewBox="0 0 18 18" width="15" height="15" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 1l2 5h5l-4 3 1.5 5L9 11l-4.5 3L6 9 2 6h5z"/>
                  </svg>
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-purple-900">Admin Panel</p>
                  <p className="text-xs text-purple-400">Manage users &amp; roles</p>
                </div>
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#9333ea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </button>
            </section>
          )}

          {/* ── Recent transactions ── */}
          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[0.68rem] font-bold uppercase tracking-widest text-gray-400">Recent</h2>
              {feedItems.length > 0 && (
                <Link to="/activity" className="text-xs font-semibold text-blue-600 transition hover:text-blue-700">
                  View all
                </Link>
              )}
            </div>

            {/* skeleton while loading */}
            {transactions === null && feedItems.length === 0 && (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3 rounded-xl p-3">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-gray-100 animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/5 rounded-full bg-gray-100 animate-pulse" />
                      <div className="h-2.5 w-1/4 rounded-full bg-gray-100 animate-pulse" />
                    </div>
                    <div className="h-3 w-12 rounded-full bg-gray-100 animate-pulse" />
                  </div>
                ))}
              </div>
            )}

            {transactions !== null && feedItems.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">No transactions yet</p>
                  <p className="mt-1 text-xs text-gray-400">Your transfers will appear here</p>
                </div>
                <button onClick={() => navigate("/send")}
                  className="mt-1 rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white transition hover:bg-blue-700">
                  Send money
                </button>
              </div>
            )}

            {groups.map(group => (
              <div key={group.label} className="mb-5">
                <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-widest text-gray-400">{group.label}</p>
                <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                  {group.items.map((item, i) => (
                    item.kind === "xpay"
                      ? <TxRow key={item.tx.id} tx={item.tx} last={i === group.items.length - 1} />
                      : <OnChainTxRow key={item.tx.hash + item.tx.type} tx={item.tx} last={i === group.items.length - 1} nativeSymbol={activeChain.nativeSymbol} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}

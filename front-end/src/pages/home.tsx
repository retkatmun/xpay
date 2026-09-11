import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "@/lib/session";
import { useFundWallet } from "@privy-io/react-auth";
import { Avatar } from "@/components/Avatar";
import { CopyButton } from "@/components/CopyButton";
import { formatUSD } from "@/lib/money";
import { dayLabel } from "@/lib/time";
import { statusLabel, statusColor } from "@/lib/txStatus";
import { getTokenLogo, getNetworkLogo } from "@/assets/logos";
import type { Transaction } from "@/lib/types";
import { getTransactions } from "@/lib/api";
import { useUsdcBalance } from "@/lib/useUsdcBalance";
import xpayLogo from "@/assets/xpay_logo.png";

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

// ─── Main home ────────────────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate();
  const { authUser, profile, loading, walletAddress, isAdmin } = useSession();
  const { fundWallet } = useFundWallet();
  const { balance: usdcBalance, loading: balanceLoading, refresh: refreshBalance } = useUsdcBalance();
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [fundLoading, setFundLoading] = useState(false);
  const [fundSuccess, setFundSuccess] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);

  useEffect(() => {
    if (!loading && !authUser) navigate("/login", { replace: true });
    if (!loading && authUser && !profile) navigate("/onboarding", { replace: true });
  }, [loading, authUser, profile, navigate]);

  useEffect(() => {
    if (!profile) return;
    void getTransactions().then(setTransactions).catch(() => setTransactions([]));
  }, [profile]);

  if (loading || !authUser || !profile) return <div className="min-h-dvh bg-white" />;

  const amount = usdcBalance;
  const recent = transactions?.slice(0, 5) ?? [];
  const displayName = profile.display_name || profile.username;

  // Group transactions by date
  const groups: { label: string; items: Transaction[] }[] = [];
  if (transactions) {
    const map = new Map<string, Transaction[]>();
    for (const t of recent) {
      const k = dayLabel(t.createdAt);
      const b = map.get(k);
      if (b) b.push(t); else map.set(k, [t]);
    }
    for (const [label, items] of map) groups.push({ label, items });
  }

  const handleFund = async () => {
    const addr = walletAddress || profile.wallet_address;
    if (!addr) { navigate("/receive"); return; }
    setFundLoading(true);
    setFundSuccess(false);
    try {
      await fundWallet(addr, { chain: { id: 8453 }, amount: "50" });
      setFundSuccess(true);
      setTimeout(() => {
        void refreshBalance();
        setFundSuccess(false);
      }, 3000);
    } catch {
      // user cancelled
    } finally {
      setFundLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-white">
      {/* ── Fixed top navbar ── */}
      <nav className="fixed inset-x-0 top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[26.25rem] items-center justify-between px-5">
          {/* Logo */}
          <img src={xpayLogo} alt="XPay" className="h-7 w-auto object-contain" />
          {/* Right: network badge + avatar */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1">
              <img src={getNetworkLogo("base")} alt="Base" className="h-3.5 w-3.5 rounded-full" />
              <span className="text-[10px] font-bold text-blue-600">Base</span>
            </div>
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
                <div className="flex items-center justify-between">
                  <p className="text-[0.68rem] font-bold uppercase tracking-widest text-blue-200">Total balance</p>
                  <button
                    onClick={() => setBalanceVisible(v => !v)}
                    className="flex items-center justify-center rounded-full p-1 text-blue-200 transition hover:text-white active:scale-90"
                    aria-label={balanceVisible ? "Hide balance" : "Show balance"}
                  >
                    {balanceVisible ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                <p className="mt-1.5 font-[var(--font-instrument-serif)] text-[2.8rem] leading-none tracking-[-0.03em] text-white tabular-nums">
                  {!balanceVisible
                    ? <span className="tracking-widest">••••••</span>
                    : balanceLoading
                      ? <span className="inline-block h-9 w-32 animate-pulse rounded-xl bg-white/20 align-middle" />
                      : amount === null
                        ? <span className="opacity-30">$0.00</span>
                        : formatUSD(amount)}
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  <img src={getTokenLogo("USDC")} alt="USDC" className="h-4 w-4 rounded-full" />
                  <span className="text-xs font-semibold text-blue-200">USDC on Base</span>
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

            {/* Convert USDC → NGN */}
            <button
              onClick={() => navigate("/convert")}
              className="group flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50/60 active:scale-[.98]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 transition group-hover:bg-orange-100">
                <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="#ea580c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 3v14M6 6l4-3 4 3M6 14l4 3 4-3"/>
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Convert to Naira</p>
                <p className="mt-0.5 text-[11px] leading-tight text-gray-400">Sell USDC → Nigerian bank</p>
              </div>
            </button>

            {/* Add funds */}
            <button
              onClick={handleFund}
              disabled={fundLoading}
              className="group flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/60 active:scale-[.98] disabled:opacity-60"
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${fundSuccess ? "bg-green-500" : "bg-emerald-50 group-hover:bg-emerald-100"}`}>
                {fundLoading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                ) : fundSuccess ? (
                  <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10l4.5 4.5L16 6"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 4v12M4 10h12"/>
                  </svg>
                )}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {fundSuccess ? "Funds received!" : "Add funds"}
                </p>
                <p className="mt-0.5 text-[11px] leading-tight text-gray-400">
                  {fundSuccess ? "Balance updating…" : "Buy USDC with card"}
                </p>
              </div>
            </button>
          </section>

          {/* ── Assets / Wallet card — below action grid ── */}
          <section className="mt-6">
            <h2 className="mb-3 text-[0.68rem] font-bold uppercase tracking-widest text-gray-400">Wallet</h2>
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              {/* Embedded wallet row */}
              {walletAddress && (
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <img src={getNetworkLogo("base")} alt="Base" className="h-8 w-8 rounded-full shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Embedded wallet</p>
                      <p className="text-xs text-gray-400">Base · Privy</p>
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
              {/* USDC */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <img src={getTokenLogo("USDC")} alt="USDC" className="h-9 w-9 rounded-full shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">USDC</p>
                  <p className="text-xs text-gray-400">USD Coin · Base</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-gray-900">
                    {balanceLoading ? (
                      <span className="h-3 w-14 inline-block animate-pulse rounded bg-gray-100" />
                    ) : amount !== null ? formatUSD(amount) : "$0.00"}
                  </p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">stablecoin</p>
                </div>
              </div>
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
              {recent.length > 0 && (
                <Link to="/activity" className="text-xs font-semibold text-blue-600 transition hover:text-blue-700">
                  View all
                </Link>
              )}
            </div>

            {transactions === null && (
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

            {transactions !== null && recent.length === 0 && (
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
                  {group.items.map((tx, i) => (
                    <TxRow key={tx.id} tx={tx} last={i === group.items.length - 1} />
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

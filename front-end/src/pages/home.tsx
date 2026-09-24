import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "@/lib/session";
import { Avatar } from "@/components/Avatar";
import { CopyButton } from "@/components/CopyButton";
import { formatUSD } from "@/lib/money";
import { dayLabel } from "@/lib/time";
import { statusLabel } from "@/lib/txStatus";
import { getTokenLogo } from "@/assets/logos";
import type { Transaction } from "@/lib/types";
import { getTransactions } from "@/lib/api";
import { useWalletBalances } from "@/lib/useUsdcBalance";
import { useOnChainTxs, type OnChainTx } from "@/lib/useOnChainTxs";
import { useNetwork } from "@/lib/NetworkContext";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import xpayLogo from "@/assets/xpay_logo.png";

const BALANCE_VISIBLE_KEY = "xpay_balance_visible";
function readBalanceVisible(): boolean {
  try { const r = localStorage.getItem(BALANCE_VISIBLE_KEY); if (r !== null) return r !== "false"; } catch {}
  return true;
}
function formatEth(wei: bigint): string {
  const e = Number(wei) / 1e18;
  if (e === 0) return "0 ETH";
  if (e < 0.0001) return "< 0.0001 ETH";
  return `${e.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })} ETH`;
}

// ── Quick action icon button (horizontal row like Tokkenly) ───────────────────
function QuickAction({ icon, label, onClick, primary }: {
  icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean;
}) {
  return (
    <button onClick={onClick}
      className="flex flex-1 flex-col items-center gap-2 transition active:scale-95">
      <span className={[
        "flex h-14 w-14 items-center justify-center rounded-2xl transition",
        primary
          ? "bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-900/40"
          : "bg-black hover:bg-[#252528] border border-white/[0.08]",
      ].join(" ")}>
        {icon}
      </span>
      <span className="text-[11px] font-medium text-white/50">{label}</span>
    </button>
  );
}

// ── Transaction row ───────────────────────────────────────────────────────────
function TxRow({ tx, last }: { tx: Transaction; last: boolean }) {
  const navigate = useNavigate();
  const out = tx.direction === "out";
  return (
    <button onClick={() => navigate(`/activity/${tx.id}`)}
      className={["flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition hover:bg-white/[0.03] active:bg-white/[0.06]",
        !last ? "border-b border-white/[0.06]" : ""].join(" ")}>
      <div className="relative shrink-0">
        {tx.recipientType === "bank_account" ? (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.75" strokeLinecap="round"><path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4"/></svg>
          </div>
        ) : (
          <Avatar name={tx.recipientDisplayName} size={44} />
        )}
        <span className={`absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white ${out ? "bg-[#3a3a3c]" : "bg-emerald-500"}`}>
          {out ? "↑" : "↓"}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-white/90">{tx.recipientDisplayName}</p>
        <p className="mt-0.5 text-[12px] text-white/35">{statusLabel(tx.status)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-[15px] font-semibold tabular-nums ${out ? "text-white/80" : "text-emerald-400"}`}>
          {out ? "−" : "+"}{formatUSD(BigInt(tx.amount))}
        </p>
        {BigInt(tx.ngnAmount) > 0n && (
          <p className="mt-0.5 text-[11px] text-white/30 tabular-nums">₦{BigInt(tx.ngnAmount).toLocaleString("en-NG")}</p>
        )}
      </div>
    </button>
  );
}

// ── On-chain row ──────────────────────────────────────────────────────────────
function OnChainTxRow({ tx, last, sym }: { tx: OnChainTx; last: boolean; sym: string }) {
  const isIn = tx.type === "eth_in" || tx.type === "usdc_in";
  const val = tx.asset === "ETH"
    ? `${(Number(tx.value) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${sym}`
    : formatUSD(tx.value);
  return (
    <a href={tx.explorerUrl} target="_blank" rel="noreferrer"
      className={["flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition hover:bg-white/[0.03]",
        !last ? "border-b border-white/[0.06]" : ""].join(" ")}>
      <div className="relative shrink-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black">
          {tx.asset === "ETH"
            ? <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2L4 12l8 5 8-5L12 2z" fill="#627EEA" opacity="0.9"/><path d="M4 12l8 10 8-10" fill="#627EEA" opacity="0.5"/></svg>
            : <img src={getTokenLogo("USDC")} alt="USDC" className="h-6 w-6 rounded-full" />}
        </div>
        <span className={`absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white ${isIn ? "bg-emerald-500" : "bg-[#3a3a3c]"}`}>
          {isIn ? "↓" : "↑"}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-white/90">{isIn ? `Received ${tx.asset === "ETH" ? sym : tx.asset}` : `Sent ${tx.asset === "ETH" ? sym : tx.asset}`}</p>
        <p className="mt-0.5 text-[12px] text-white/35 truncate">{tx.counterpart}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-[15px] font-semibold tabular-nums ${isIn ? "text-emerald-400" : "text-white/80"}`}>{isIn ? "+" : "−"}{val}</p>
        <p className="mt-0.5 text-[10px] text-white/25">on-chain</p>
      </div>
    </a>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
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
  const effectiveWallet = walletAddress || profile?.wallet_address || null;
  const { txs: onChainTxs, refresh: refreshOnChain } = useOnChainTxs(effectiveWallet, activeChain);

  const toggle = () => setBalanceVisible(v => { const n = !v; try { localStorage.setItem(BALANCE_VISIBLE_KEY, String(n)); } catch {} return n; });

  const fetchTx = useCallback(async (silent = false) => {
    if (!profile) return;
    if (!silent) setTransactions(null);
    setTxLoading(true);
    try { setTransactions(await getTransactions(authUser?.id)); }
    catch { setTransactions([]); }
    finally { setTxLoading(false); }
  }, [profile, authUser?.id]);

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
  useEffect(() => { if (profile) void fetchTx(); }, [profile]); // eslint-disable-line
  useEffect(() => {
    if (!profile || activeChain.id === lastChainId.current) return;
    lastChainId.current = activeChain.id; void fetchTx(true);
  }, [activeChain.id]); // eslint-disable-line

  if (loading || !authUser || !profile) return <div className="min-h-dvh bg-[#111113]" />;

  const displayName = profile.display_name || profile.username;
  const isEthChain = activeChain.nativeSymbol === "ETH";

  // feed
  type FI = { kind: "xpay"; tx: Transaction; ts: number } | { kind: "onchain"; tx: OnChainTx; ts: number };
  const feedItems: FI[] = [
    ...(transactions ?? []).map(tx => ({ kind: "xpay" as const, tx, ts: new Date(tx.createdAt).getTime() })),
    ...onChainTxs.map(tx => ({ kind: "onchain" as const, tx, ts: tx.timestamp * 1000 })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 12);

  const groups: { label: string; items: FI[] }[] = [];
  const gmap = new Map<string, FI[]>();
  for (const item of feedItems) {
    const k = dayLabel(new Date(item.ts).toISOString());
    const a = gmap.get(k); if (a) a.push(item); else gmap.set(k, [item]);
  }
  for (const [label, items] of gmap) groups.push({ label, items });

  // balance display
  const balStr = () => {
    if (!balanceVisible) return "••••••";
    if (balanceLoading || refreshing) return null; // skeleton
    return usdcBalance !== null ? formatUSD(usdcBalance) : "$0.00";
  };
  const bs = balStr();

  return (
    <div className="min-h-dvh bg-[#111113] text-white selection:bg-emerald-500/30">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#111113]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[430px] items-center justify-between px-5">
          <img src={xpayLogo} alt="XPay" className="h-6 w-auto object-contain brightness-0 invert opacity-90" />
          <div className="flex items-center gap-2.5">
            <NetworkSwitcher />
            <Link to="/wallet"
              className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.05] py-1 pl-3 pr-1.5 transition hover:border-white/20">
              <span className="text-[13px] font-medium text-white/60">{displayName}</span>
              <Avatar name={displayName} size={24} />
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-[430px] px-0 pb-24">

        {/* ── Portfolio / Balance Card ── */}
        {/* Tokkenly style: dark card, large number, % change pill, asset rows inside */}
        <div className="mx-5 mt-5 overflow-hidden rounded-3xl bg-[#1a1a1c] border border-white/[0.07]">

          {/* Card header */}
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-medium text-white/40">Portfolio</p>
                <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-semibold text-white/40 uppercase tracking-wide">
                  {activeChain.isTestnet ? "Testnet" : "Live"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={handleRefresh} disabled={refreshing || balanceLoading}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white/30 transition hover:text-white/60 disabled:opacity-30">
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
                    className={refreshing || balanceLoading ? "animate-spin" : ""}>
                    <path d="M4 4a8 8 0 0112 0M16 16a8 8 0 01-12 0M2.5 9.5V5h4.5M17.5 10.5V15h-4.5"/>
                  </svg>
                </button>
                <button onClick={toggle}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white/30 transition hover:text-white/60">
                  {balanceVisible
                    ? <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="10" cy="10" r="2.5"/></svg>
                    : <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M13.875 13.875A8.963 8.963 0 0110 15c-5.5 0-9-5-9-5a16.47 16.47 0 014.125-4.125M8.25 4.135A8.963 8.963 0 0110 4c5.5 0 9 5 9 5a16.47 16.47 0 01-2.1 2.773M3 3l14 14"/></svg>}
                </button>
              </div>
            </div>

            {/* Big balance number */}
            <div className="mt-3">
              {bs === null ? (
                <div className="h-12 w-44 animate-pulse rounded-2xl bg-white/10" />
              ) : (
                <p className="text-[44px] font-bold tracking-tight leading-none text-white tabular-nums">
                  {balanceVisible ? bs : <span className="text-white/30 tracking-[0.15em] text-3xl">••••••</span>}
                </p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <img src={getTokenLogo("USDC")} alt="USDC" className="h-4 w-4 rounded-full" />
                  <span className="text-[12px] text-white/40">USDC · {activeChain.name}</span>
                </div>
                {(refreshing || txLoading) && (
                  <span className="flex items-center gap-1 text-[11px] text-white/30">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    Updating
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/[0.06]" />

          {/* Asset rows inside card — Tokkenly style */}
          <div>
            {/* USDC row */}
            <div className="flex items-center gap-3.5 px-5 py-3.5 border-b border-white/[0.05]">
              <img src={getTokenLogo("USDC")} alt="USDC" className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-white/90">USDC</p>
                <p className="text-[12px] text-white/35">Stablecoin</p>
              </div>
              <p className="text-[14px] font-semibold tabular-nums text-white/80">
                {balanceLoading || refreshing ? <span className="h-3 w-16 inline-block animate-pulse rounded-lg bg-white/10" /> : usdcBalance !== null ? formatUSD(usdcBalance) : "$0.00"}
              </p>
            </div>

            {/* ETH row */}
            {isEthChain && (
              <div className="flex items-center gap-3.5 px-5 py-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#627EEA]/15">
                  <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2L4 12l8 5 8-5L12 2z" fill="#627EEA" opacity="0.9"/><path d="M4 12l8 10 8-10" fill="#627EEA" opacity="0.5"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-white/90">{activeChain.nativeSymbol}</p>
                  <p className="text-[12px] text-white/35">Native token</p>
                </div>
                <p className="text-[14px] font-semibold tabular-nums text-white/80">
                  {balanceLoading || refreshing ? <span className="h-3 w-16 inline-block animate-pulse rounded-lg bg-white/10" /> : ethBalance !== null ? formatEth(ethBalance) : `0 ${activeChain.nativeSymbol}`}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Handle + wallet row ── */}
        <div className="mx-5 mt-3 flex items-center justify-between rounded-2xl border border-white/[0.07] bg-[#1a1a1c] px-4 py-3">
          <div className="flex items-center gap-2">
            {walletAddress && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
            <span className="font-mono text-[13px] font-semibold text-white/50">{profile.username}.xpay</span>
          </div>
          <CopyButton value={`${profile.username}.xpay`} label="Copy" />
        </div>

        {/* ── Quick actions — horizontal row like Tokkenly ── */}
        <div className="mx-5 mt-6">
          <div className="flex items-start justify-between gap-1">
            <QuickAction primary onClick={() => navigate("/send")} label="Send"
              icon={<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10h14M13 5l5 5-5 5"/></svg>} />
            <QuickAction onClick={() => navigate("/receive")} label="Receive"
              icon={<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 10H3M7 15l-5-5 5-5"/></svg>} />
            <QuickAction onClick={() => navigate("/convert")} label="Convert"
              icon={<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h14M7 3l-4 4 4 4M17 13H3M13 9l4 4-4 4"/></svg>} />
            <QuickAction onClick={() => navigate("/swap")} label="Swap"
              icon={<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h12M4 6l3-3M4 6l3 3M16 14H4M16 14l-3-3M16 14l-3 3"/></svg>} />
            <QuickAction onClick={() => navigate("/activity")} label="Activity"
              icon={<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10h3l3-6 3 12 3-6h2"/></svg>} />
          </div>
        </div>

        {/* ── Dashboard & Admin shortcuts ── */}
        <div className="mx-5 mt-5 space-y-2">
          <button onClick={() => navigate("/dashboard")}
            className="flex w-full items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-[#1a1a1c] px-4 py-3.5 text-left transition hover:bg-white/[0.04] active:scale-[.98]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.07]">
              <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/></svg>
            </span>
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-white/85">My Dashboard</p>
              <p className="text-[12px] text-white/35">Enrollments &amp; progress</p>
            </div>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round"><path d="M6 4l4 4-4 4"/></svg>
          </button>

          {isAdmin && (
            <button onClick={() => navigate("/admin")}
              className="flex w-full items-center gap-3.5 rounded-2xl border border-violet-500/25 bg-violet-500/[0.08] px-4 py-3.5 text-left transition hover:bg-violet-500/[0.13] active:scale-[.98]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/20">
                <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round"><path d="M9 1l2 5h5l-4 3 1.5 5L9 11l-4.5 3L6 9 2 6h5z"/></svg>
              </span>
              <div className="flex-1">
                <p className="text-[14px] font-semibold text-violet-300">Admin Panel</p>
                <p className="text-[12px] text-violet-400/50">Manage users &amp; enrollments</p>
              </div>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round"><path d="M6 4l4 4-4 4"/></svg>
            </button>
          )}
        </div>

        {/* ── Recent activity ── */}
        <div className="mx-5 mt-8">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-white/50 uppercase tracking-widest">Activity</p>
            {feedItems.length > 0 && (
              <Link to="/activity" className="text-[13px] font-semibold text-emerald-400 hover:text-emerald-300 transition">See all</Link>
            )}
          </div>

          {/* skeleton */}
          {transactions === null && feedItems.length === 0 && (
            <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-[#1a1a1c] divide-y divide-white/[0.05]">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3.5 px-5 py-4">
                  <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-white/[0.08]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-2/5 animate-pulse rounded-full bg-white/[0.08]" />
                    <div className="h-2.5 w-1/4 animate-pulse rounded-full bg-white/[0.06]" />
                  </div>
                  <div className="h-3.5 w-14 animate-pulse rounded-full bg-white/[0.08]" />
                </div>
              ))}
            </div>
          )}

          {/* empty */}
          {transactions !== null && feedItems.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-white/[0.08] py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.05]">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
              </div>
              <div>
                <p className="text-[15px] font-semibold text-white/50">No transactions yet</p>
                <p className="mt-1 text-[13px] text-white/25">Send or receive money to get started</p>
              </div>
              <button onClick={() => navigate("/send")}
                className="mt-2 rounded-2xl bg-emerald-500 px-6 py-2.5 text-[13px] font-semibold text-white transition hover:bg-emerald-400">
                Send money
              </button>
            </div>
          )}

          {/* grouped */}
          <div className="space-y-5">
            {groups.map(group => (
              <div key={group.label}>
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-white/25">{group.label}</p>
                <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-[#1a1a1c]">
                  {group.items.map((item, i) =>
                    item.kind === "xpay"
                      ? <TxRow key={item.tx.id} tx={item.tx} last={i === group.items.length - 1} />
                      : <OnChainTxRow key={item.tx.hash + item.tx.type} tx={item.tx} last={i === group.items.length - 1} sym={activeChain.nativeSymbol} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

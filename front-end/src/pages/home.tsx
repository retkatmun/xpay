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
import { useAllChainsOnChainTxs, type OnChainTx } from "@/lib/useOnChainTxs";
import { useNetwork } from "@/lib/NetworkContext";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { useProfileAvatars } from "@/lib/useProfileAvatars";
import xpayLogo from "@/assets/xpay_logo.png";

// ─── Constants ────────────────────────────────────────────────────────────────

const BALANCE_VISIBLE_KEY = "xpay_balance_visible";
function readBalanceVisible(): boolean {
  try {
    const r = localStorage.getItem(BALANCE_VISIBLE_KEY);
    if (r !== null) return r !== "false";
  } catch {}
  return true;
}
function formatEth(wei: bigint): string {
  const e = Number(wei) / 1e18;
  if (e === 0) return "0 ETH";
  if (e < 0.0001) return "< 0.0001 ETH";
  return `${e.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })} ETH`;
}

// ─── Nav icons ────────────────────────────────────────────────────────────────

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none"
      stroke={active ? "#10b981" : "rgba(255,255,255,0.4)"}
      strokeWidth={active ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M7 18v-6h6v6" />
    </svg>
  );
}
function PortfolioIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none"
      stroke={active ? "#10b981" : "rgba(255,255,255,0.4)"}
      strokeWidth={active ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="16" height="12" rx="1.5" />
      <path d="M6 5V4a2 2 0 014 0v1" />
      <path d="M2 10h16" />
    </svg>
  );
}
function ActivityIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none"
      stroke={active ? "#10b981" : "rgba(255,255,255,0.4)"}
      strokeWidth={active ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 2.5" />
    </svg>
  );
}
function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none"
      stroke={active ? "#10b981" : "rgba(255,255,255,0.4)"}
      strokeWidth={active ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" />
    </svg>
  );
}

// ─── Action quick-button ──────────────────────────────────────────────────────

function Action({ icon, label, onClick }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-2 transition active:scale-95"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.1] bg-white/[0.04] transition hover:border-white/25 hover:bg-white/[0.07]">
        {icon}
      </span>
      <span className="w-full text-center text-[11px] font-medium leading-tight text-white/40">
        {label}
      </span>
    </button>
  );
}

// ─── XPay transaction row ─────────────────────────────────────────────────────

function TxRow({ tx, last, avatarSrc }: {
  tx: Transaction; last: boolean; avatarSrc?: string | null;
}) {
  const navigate = useNavigate();
  const out = tx.direction === "out";
  const methodLabel =
    tx.recipientType === "bank_account" ? "Bank transfer"
    : tx.recipientDisplayName?.startsWith("+") || /^\d{10,}$/.test(tx.recipientDisplayName ?? "")
    ? "Phone" : "Username";

  return (
    <button
      onClick={() => navigate(`/activity/${tx.id}`)}
      className={[
        "flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-white/[0.025] active:bg-white/[0.04]",
        !last ? "border-b border-white/[0.06]" : "",
      ].join(" ")}
    >
      <div className="relative shrink-0">
        {tx.recipientType === "bank_account" ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06]">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
              stroke="rgba(255,255,255,0.35)" strokeWidth="1.75" strokeLinecap="round">
              <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4" />
            </svg>
          </div>
        ) : (
          <Avatar name={tx.recipientDisplayName} size={40} src={avatarSrc} />
        )}
        <span className={`absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white ${out ? "bg-white/20" : "bg-emerald-500"}`}>
          {out ? "↑" : "↓"}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-white/80">{tx.recipientDisplayName}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-400/70">{tx.asset ?? "USDC"}</span>
          <span className="text-[9px] text-white/15">·</span>
          <span className="text-[10px] text-white/25">{methodLabel}</span>
          <span className="text-[9px] text-white/15">·</span>
          <span className="text-[10px] text-white/25">{statusLabel(tx.status)}</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-[14px] font-semibold tabular-nums ${out ? "text-white/60" : "text-emerald-400"}`}>
          {out ? "−" : "+"}{formatUSD(BigInt(tx.amount))}
        </p>
        {BigInt(tx.ngnAmount) > 0n && (
          <p className="mt-0.5 text-[11px] text-white/25 tabular-nums">
            ₦{BigInt(tx.ngnAmount).toLocaleString("en-NG")}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── On-chain transaction row ─────────────────────────────────────────────────

function OnChainTxRow({ tx, last }: { tx: OnChainTx; last: boolean }) {
  const isIn = tx.type === "eth_in" || tx.type === "usdc_in";
  const val = tx.asset === "ETH"
    ? `${(Number(tx.value) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 6 })} ETH`
    : formatUSD(tx.value);
  const chainColor = tx.chainId === 84532 ? "text-blue-400/70" : "text-purple-400/70";

  return (
    <a
      href={tx.explorerUrl}
      target="_blank"
      rel="noreferrer"
      className={[
        "flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-white/[0.025]",
        !last ? "border-b border-white/[0.06]" : "",
      ].join(" ")}
    >
      <div className="relative shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06]">
          {tx.asset === "ETH"
            ? <svg viewBox="0 0 24 24" width="16" height="16">
                <path d="M12 2L4 12l8 5 8-5L12 2z" fill="#627EEA" opacity="0.9" />
                <path d="M4 12l8 10 8-10" fill="#627EEA" opacity="0.5" />
              </svg>
            : <img src={getTokenLogo("USDC")} alt="USDC" className="h-5 w-5 rounded-full" />
          }
        </div>
        <span className={`absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white ${isIn ? "bg-emerald-500" : "bg-white/20"}`}>
          {isIn ? "↓" : "↑"}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-white/80">
          {isIn ? `Received ${tx.asset}` : `Sent ${tx.asset}`}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${chainColor}`}>{tx.chainName}</span>
          <span className="text-[9px] text-white/15">·</span>
          <span className="truncate text-[10px] text-white/30">{tx.counterpart}</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-[14px] font-semibold tabular-nums ${isIn ? "text-emerald-400" : "text-white/60"}`}>
          {isIn ? "+" : "−"}{val}
        </p>
        <p className="mt-0.5 text-[10px] text-white/20">on-chain</p>
      </div>
    </a>
  );
}

// ─── Sidebar link ─────────────────────────────────────────────────────────────

function SidebarLink({ label, route, active, icon, navigate }: {
  label: string; route: string; active: boolean;
  icon: React.ReactNode; navigate: (r: string) => void;
}) {
  return (
    <button
      onClick={() => navigate(route)}
      className={[
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
        active
          ? "bg-emerald-500/[0.12] text-emerald-400"
          : "text-white/40 hover:bg-white/[0.04] hover:text-white/70",
      ].join(" ")}
    >
      <span className="shrink-0">{icon}</span>
      <span className="text-[13px] font-medium">{label}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" />}
    </button>
  );
}

// ─── Bottom tab ───────────────────────────────────────────────────────────────

function BottomTab({ label, active, icon, onClick }: {
  label: string; active: boolean; icon: React.ReactNode; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex flex-1 flex-col items-center gap-1 py-2 transition active:scale-95",
        active ? "text-emerald-400" : "text-white/35 hover:text-white/60",
      ].join(" ")}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const navigate = useNavigate();
  const { authUser, profile, loading, walletAddress, isAdmin } = useSession();
  const { activeChain } = useNetwork();
  const { usdc: usdcBalance, eth: ethBalance, loading: balanceLoading, refresh: refreshBalance } =
    useWalletBalances(activeChain);

  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [txLoading, setTxLoading]       = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(readBalanceVisible);
  const [refreshing, setRefreshing]     = useState(false);
  const lastChainId = useRef<number>(activeChain.id);

  const effectiveWallet = walletAddress || profile?.wallet_address || null;
  const { txs: onChainTxs, refresh: refreshOnChain } = useAllChainsOnChainTxs(effectiveWallet);

  const toggle = () =>
    setBalanceVisible(v => {
      const n = !v;
      try { localStorage.setItem(BALANCE_VISIBLE_KEY, String(n)); } catch {}
      return n;
    });

  const fetchTx = useCallback(async (silent = false) => {
    if (!authUser?.id) return;
    if (!silent) setTransactions(null);
    setTxLoading(true);
    try { setTransactions(await getTransactions(authUser.id)); }
    catch { setTransactions([]); }
    finally { setTxLoading(false); }
  }, [authUser?.id]);

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
    lastChainId.current = activeChain.id;
    void fetchTx(true);
  }, [activeChain.id]); // eslint-disable-line

  // Must be unconditional (Rules of Hooks)
  const txUsernames = (transactions ?? [])
    .filter(tx => tx.recipientType === "xpay_user" && tx.recipientUsername)
    .map(tx => tx.recipientUsername as string)
    .filter((u, i, arr) => arr.indexOf(u) === i);
  const feedAvatars = useProfileAvatars(txUsernames);

  if (loading || !authUser || !profile) return <div className="min-h-dvh bg-[#111113]" />;

  const displayName = profile.display_name || profile.username;
  const isEthChain  = activeChain.nativeSymbol === "ETH";

  // Build combined feed
  type FI = { kind: "xpay"; tx: Transaction; ts: number } | { kind: "onchain"; tx: OnChainTx; ts: number };
  const feedItems: FI[] = [
    ...(transactions ?? []).map(tx => ({ kind: "xpay" as const, tx, ts: new Date(tx.createdAt).getTime() })),
    ...onChainTxs.map(tx => ({ kind: "onchain" as const, tx, ts: tx.timestamp * 1000 })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 4);

  const groups: { label: string; items: FI[] }[] = [];
  const gmap = new Map<string, FI[]>();
  for (const item of feedItems) {
    const k = dayLabel(new Date(item.ts).toISOString());
    const arr = gmap.get(k);
    if (arr) arr.push(item); else gmap.set(k, [item]);
  }
  for (const [label, items] of gmap) groups.push({ label, items });

  const bs = (() => {
    if (!balanceVisible) return "hidden";
    if (balanceLoading || refreshing) return null;
    return usdcBalance !== null ? formatUSD(usdcBalance) : "$0.00";
  })();

  // Sidebar / bottom-tab nav definition
  const navDef = [
    { label: "Home",      route: "/home",      icon: (a: boolean) => <HomeIcon active={a} /> },
    { label: "Portfolio", route: "/dashboard",  icon: (a: boolean) => <PortfolioIcon active={a} /> },
    { label: "Activity",  route: "/activity",   icon: (a: boolean) => <ActivityIcon active={a} /> },
    { label: "Settings",  route: "/settings",   icon: (a: boolean) => <SettingsIcon active={a} /> },
  ];

  return (
    <div className="min-h-dvh bg-[#111113] text-white selection:bg-emerald-500/30">

      {/* ── Top navbar ── */}
      <nav className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#111113]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[900px] items-center justify-between px-5">
          <Link to="/" className="shrink-0">
            <img src={xpayLogo} alt="XPay"
              className="h-6 w-auto object-contain brightness-0 invert opacity-90" />
          </Link>
          <div className="flex items-center gap-2.5">
            <NetworkSwitcher />
            <Link
              to="/wallet"
              className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] py-1 pl-3 pr-1.5 transition hover:border-white/20"
            >
              <span className="text-[13px] font-medium text-white/55">{displayName}</span>
              <Avatar name={displayName} size={24} src={profile.avatar_url} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Body: sidebar + main ── */}
      <div className="mx-auto flex max-w-[900px]">

        {/* Left sidebar — desktop only (lg+) */}
        <aside className="hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:border-r lg:border-white/[0.06]">
          <div className="sticky top-14 flex flex-col gap-1 px-3 pt-6 pb-8">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-white/20">Menu</p>

            {navDef.map(({ label, route, icon }) => (
              <SidebarLink
                key={route}
                label={label}
                route={route}
                active={route === "/home"}
                icon={icon(route === "/home")}
                navigate={navigate}
              />
            ))}

            <div className="my-3 border-t border-white/[0.06]" />

            {/* User mini-card */}
            <Link
              to="/wallet"
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition hover:bg-white/[0.04]"
            >
              <Avatar name={displayName} size={28} src={profile.avatar_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-white/70">{displayName}</p>
                <p className="truncate font-mono text-[10px] text-white/30">{profile.username}.xpay</p>
              </div>
            </Link>

            {isAdmin && (
              <button
                onClick={() => navigate("/admin")}
                className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.04]"
              >
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none"
                  stroke="rgba(167,139,250,0.6)" strokeWidth="1.75" strokeLinecap="round">
                  <path d="M10 2a2 2 0 012 2v1h3a1 1 0 011 1v11a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1h3V4a2 2 0 012-2z" />
                  <path d="M7 10h6M7 13h4" />
                </svg>
                <span className="text-[13px] font-medium text-violet-300">Admin</span>
              </button>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 pb-24 lg:pb-10">

          {/* Balance card */}
          <div className="px-5 pt-8 pb-6 lg:px-6">
            <div className="rounded-2xl border border-white/[0.07] bg-[#1a1a1c] px-6 py-6">

              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/25">Total Balance</p>
                <div className="flex items-center gap-2">
                  <button onClick={toggle} aria-label={balanceVisible ? "Hide balance" : "Show balance"}
                    className="text-white/25 transition hover:text-white/55">
                    {balanceVisible
                      ? <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" /><circle cx="10" cy="10" r="2.5" /></svg>
                      : <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M13.875 13.875A8.963 8.963 0 0110 15c-5.5 0-9-5-9-5a16.47 16.47 0 014.125-4.125M8.25 4.135A8.963 8.963 0 0110 4c5.5 0 9 5 9 5a16.47 16.47 0 01-2.1 2.773M3 3l14 14" /></svg>
                    }
                  </button>
                  <button onClick={handleRefresh} disabled={refreshing || balanceLoading}
                    aria-label="Refresh" className="text-white/25 transition hover:text-white/55 disabled:opacity-30">
                    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round"
                      className={refreshing || balanceLoading ? "animate-spin" : ""}>
                      <path d="M4 4a8 8 0 0112 0M16 16a8 8 0 01-12 0M2.5 9.5V5h4.5M17.5 10.5V15h-4.5" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div className="mt-3">
                {bs === null
                  ? <div className="h-10 w-36 animate-pulse rounded-xl bg-white/[0.08]" />
                  : bs === "hidden"
                  ? <span className="text-[36px] font-bold leading-none tracking-[0.1em] text-white/20">••••••</span>
                  : <span className="text-[36px] font-bold leading-none tabular-nums text-white">{bs}</span>
                }
                {(refreshing || txLoading) && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/25">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    Updating…
                  </p>
                )}
              </div>

              {/* Asset rows */}
              <div className="mt-5 space-y-2.5">
                {/* USDC */}
                <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
                  <img src={getTokenLogo("USDC")} alt="USDC" className="h-7 w-7 shrink-0 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white/75">USDC</p>
                    <p className="text-[11px] text-white/30">Stablecoin</p>
                  </div>
                  <p className="tabular-nums text-[13px] font-semibold text-white/70">
                    {balanceLoading || refreshing
                      ? <span className="inline-block h-3 w-14 animate-pulse rounded bg-white/[0.08]" />
                      : usdcBalance !== null ? formatUSD(usdcBalance) : "$0.00"}
                  </p>
                </div>

                {/* ETH */}
                {isEthChain && (
                  <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#627EEA]/10">
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <path d="M12 2L4 12l8 5 8-5L12 2z" fill="#627EEA" opacity="0.9" />
                        <path d="M4 12l8 10 8-10" fill="#627EEA" opacity="0.5" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-white/75">{activeChain.nativeSymbol}</p>
                      <p className="text-[11px] text-white/30">Native token</p>
                    </div>
                    <p className="tabular-nums text-[13px] font-semibold text-white/70">
                      {balanceLoading || refreshing
                        ? <span className="inline-block h-3 w-14 animate-pulse rounded bg-white/[0.08]" />
                        : ethBalance !== null ? formatEth(ethBalance) : `0 ${activeChain.nativeSymbol}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="px-5 pb-6 lg:px-6">
            <div className="flex items-start justify-between gap-3">
              <Action onClick={() => navigate("/send")} label="Send"
                icon={<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16L16 4M16 4H8M16 4v8" /></svg>}
              />
              <Action onClick={() => navigate("/receive")} label="Receive"
                icon={<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4L4 16M4 16h8M4 16V8" /></svg>}
              />
              <Action onClick={() => navigate("/swap")} label="Swap"
                icon={<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h12M4 6l3-3M4 6l3 3M16 14H4M16 14l-3-3M16 14l-3 3" /></svg>}
              />
              <Action onClick={() => navigate("/activity")} label="History"
                icon={<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 2.5" /></svg>}
              />
            </div>
          </div>

          {/* Handle + profile card */}
          <div className="px-5 pb-5 lg:px-6">
            <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c]">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3.5">
                <span className="font-mono text-[12px] text-white/30">{profile.username}.xpay</span>
                <CopyButton value={`${profile.username}.xpay`} label="Copy" />
              </div>
              <button
                onClick={() => navigate("/dashboard")}
                className="flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:bg-white/[0.025] active:bg-white/[0.04]"
              >
                <div>
                  <p className="text-[13px] font-medium text-white/75">Profile &amp; Enrollments</p>
                  <p className="text-[11px] text-white/30">View your courses &amp; progress</p>
                </div>
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none"
                  stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </button>
              {/* Admin row — mobile only (sidebar covers desktop) */}
              {isAdmin && (
                <button
                  onClick={() => navigate("/admin")}
                  className="flex w-full items-center justify-between border-t border-white/[0.06] px-4 py-3.5 text-left transition hover:bg-white/[0.025] active:bg-white/[0.04] lg:hidden"
                >
                  <p className="text-[13px] font-medium text-violet-300">Admin Panel</p>
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none"
                    stroke="#a78bfa" strokeWidth="2" strokeLinecap="round">
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Recent transactions */}
          <div className="px-5 pt-1 lg:px-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/25">Recent</p>
              {feedItems.length > 0 && (
                <Link to="/activity"
                  className="text-[12px] font-medium text-white/35 transition hover:text-white/60">
                  See all
                </Link>
              )}
            </div>

            {/* Loading skeleton */}
            {transactions === null && feedItems.length === 0 && (
              <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c]">
                {[1, 2, 3].map(i => (
                  <div key={i} className={`flex items-center gap-3.5 px-4 py-4 ${i < 3 ? "border-b border-white/[0.06]" : ""}`}>
                    <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/[0.07]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/5 animate-pulse rounded bg-white/[0.07]" />
                      <div className="h-2.5 w-1/4 animate-pulse rounded bg-white/[0.05]" />
                    </div>
                    <div className="h-3 w-12 animate-pulse rounded bg-white/[0.07]" />
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {transactions !== null && feedItems.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/[0.07] bg-[#1a1a1c] py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.04]">
                  <svg viewBox="0 0 20 20" width="18" height="18" fill="none"
                    stroke="rgba(255,255,255,0.2)" strokeWidth="1.75" strokeLinecap="round">
                    <circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 2.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-[14px] font-medium text-white/35">No transactions yet</p>
                  <p className="mt-0.5 text-[12px] text-white/20">Send or receive to get started</p>
                </div>
                <button
                  onClick={() => navigate("/send")}
                  className="mt-1 rounded-xl bg-emerald-500 px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-400"
                >
                  Send money
                </button>
              </div>
            )}

            {/* Grouped feed */}
            <div className="space-y-5">
              {groups.map(group => (
                <div key={group.label}>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/20">
                    {group.label}
                  </p>
                  <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c]">
                    {group.items.map((item, i) =>
                      item.kind === "xpay"
                        ? <TxRow key={item.tx.id} tx={item.tx} last={i === group.items.length - 1}
                            avatarSrc={item.tx.recipientUsername ? feedAvatars.get(item.tx.recipientUsername) : undefined} />
                        : <OnChainTxRow key={item.tx.hash + item.tx.type} tx={item.tx}
                            last={i === group.items.length - 1} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </main>
      </div>

      {/* ── Bottom tab bar — mobile only ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-[#111113]/95 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-[480px] items-stretch">
          {navDef.map(({ label, route, icon }) => (
            <BottomTab
              key={route}
              label={label}
              active={route === "/home"}
              icon={icon(route === "/home")}
              onClick={() => navigate(route)}
            />
          ))}
        </div>
      </nav>

    </div>
  );
}

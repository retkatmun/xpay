import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "@/lib/session";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Screen } from "@/components/Screen";
import { formatUSD } from "@/lib/money";
import { dayLabel } from "@/lib/time";
import { statusLabel, statusColor } from "@/lib/txStatus";
import { getTokenLogo } from "@/assets/logos";
import type { Transaction, Balance } from "@/lib/types";
import { getBalance, getTransactions } from "@/lib/api";

function TxRow({ tx, last }: { tx: Transaction; last: boolean }) {
  const navigate = useNavigate();
  const out = tx.direction === "out";
  const usd = BigInt(tx.amount);
  const ngn = BigInt(tx.ngnAmount);
  const color = statusColor(tx.status);

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
        <p className={`text-xs ${color}`}>{statusLabel(tx.status)}</p>
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

export default function Home() {
  const navigate = useNavigate();
  const { authUser, profile, loading, isAdmin } = useSession();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);

  useEffect(() => {
    if (!loading && !authUser) navigate("/login", { replace: true });
    if (!loading && authUser && !profile) navigate("/onboarding", { replace: true });
  }, [loading, authUser, profile, navigate]);

  useEffect(() => {
    if (!profile) return;
    void getBalance().then(setBalance).catch(() => null);
    void getTransactions().then(setTransactions).catch(() => setTransactions([]));
  }, [profile]);

  if (loading || !authUser || !profile) return <div className="min-h-dvh bg-white" />;

  const amount = balance ? BigInt(balance.usd) : null;
  const recent = transactions?.slice(0, 5) ?? [];
  const displayName = profile.display_name || profile.username;

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

  return (
    <Screen
      action={
        <Link
          to="/wallet"
          className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pr-1 pl-3 shadow-sm transition hover:border-gray-300"
        >
          <span className="text-xs font-medium text-gray-600">{displayName}</span>
          <Avatar name={displayName} size={26} />
        </Link>
      }
    >
      <main className="flex-1 pb-16">

        {/* ── Balance card ── */}
        <section className="mt-3">
          <div className="relative overflow-hidden rounded-2xl bg-blue-600 px-6 py-6 shadow-lg shadow-blue-200">
            {/* Subtle dot grid */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.06]"
              style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "20px 20px" }}
            />
            <div className="relative">
              <p className="text-[0.7rem] font-bold uppercase tracking-widest text-blue-200">Total balance</p>
              <p className="mt-2 font-[var(--font-instrument-serif)] text-[2.8rem] leading-none tracking-[-0.03em] text-white tabular-nums">
                {amount === null ? <span className="opacity-30">$—</span> : formatUSD(amount)}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img src={getTokenLogo("USDC")} alt="USDC" className="h-4 w-4 rounded-full" />
                  <span className="text-xs font-semibold text-blue-200">USDC · Base</span>
                </div>
                <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Quick handle ── */}
        <section className="mt-2.5">
          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5">
            <span className="text-xs text-gray-400">Your handle</span>
            <span className="font-mono text-xs font-semibold text-gray-700">@{profile.username}</span>
          </div>
        </section>

        {/* ── Action buttons ── */}
        <section className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate("/send")}
            className="group flex flex-col items-center gap-2.5 rounded-2xl border border-gray-100 bg-white px-4 py-5 shadow-sm transition hover:border-blue-100 hover:bg-blue-50 active:scale-[.97]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 shadow-md shadow-blue-200 transition group-hover:scale-105">
              <svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9h12M11 5l4 4-4 4"/>
              </svg>
            </span>
            <span className="text-sm font-semibold text-gray-900">Send</span>
          </button>
          <button
            onClick={() => navigate("/receive")}
            className="group flex flex-col items-center gap-2.5 rounded-2xl border border-gray-100 bg-white px-4 py-5 shadow-sm transition hover:border-gray-200 hover:bg-gray-50 active:scale-[.97]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 transition group-hover:bg-gray-200">
              <svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="#374151" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 9H3M7 13l-4-4 4-4"/>
              </svg>
            </span>
            <span className="text-sm font-semibold text-gray-700">Receive</span>
          </button>
        </section>

        {/* ── Assets ── */}
        <section className="mt-5">
          <h2 className="mb-3 text-[0.7rem] font-bold uppercase tracking-widest text-gray-400">Assets</h2>
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {/* USDC */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
              <img src={getTokenLogo("USDC")} alt="USDC" className="h-9 w-9 rounded-full" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">USDC</p>
                <p className="text-xs text-gray-400">USD Coin · Base</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-gray-900">
                  {amount === null ? "—" : formatUSD(amount)}
                </p>
                <p className="text-xs text-gray-400">stablecoin</p>
              </div>
            </div>
            {/* USDT */}
            <div className="flex items-center gap-3 px-4 py-3.5">
              <img src={getTokenLogo("USDT")} alt="USDT" className="h-9 w-9 rounded-full" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">USDT</p>
                <p className="text-xs text-gray-400">Tether · Base</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-gray-900">$0.00</p>
                <p className="text-xs text-gray-400">stablecoin</p>
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
            <h2 className="text-[0.7rem] font-bold uppercase tracking-widest text-gray-400">Recent</h2>
            {recent.length > 0 && (
              <Link to="/activity" className="text-xs font-semibold text-blue-600 transition hover:text-blue-700">
                View all
              </Link>
            )}
          </div>

          {/* Loading skeleton */}
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

          {/* Empty */}
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

          {/* Grouped tx list */}
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
    </Screen>
  );
}

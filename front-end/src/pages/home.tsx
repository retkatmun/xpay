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
import { NetworkSwitcher as _NS } from "@/components/NetworkSwitcher";
import { useProfileAvatars } from "@/lib/useProfileAvatars";
import { getBmoniBalance, getNgnDepositAccount, type BmoniVba } from "@/lib/bmoni";
import { AppShell } from "@/components/AppShell";

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

// ─── Receive Modal ────────────────────────────────────────────────────────────

type ReceiveModalProps = {
  asset: "USDC" | "ETH" | "NGN";
  walletAddress: string | null;
  vba: BmoniVba | null;
  username: string;
  onClose: () => void;
};

function ReceiveModal({ asset, walletAddress, vba, username, onClose }: ReceiveModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-t-3xl bg-[#18181b] border-t border-white/[0.08] px-5 pt-5 pb-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/10" />
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            {asset === "NGN" ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-[15px] font-bold text-emerald-400">₦</div>
            ) : asset === "USDC" ? (
              <img src={getTokenLogo("USDC")} alt="USDC" className="h-9 w-9 rounded-full" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#627EEA]/15">
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <path d="M12 2L4 12l8 5 8-5L12 2z" fill="#627EEA" opacity="0.9" />
                  <path d="M4 12l8 10 8-10" fill="#627EEA" opacity="0.5" />
                </svg>
              </div>
            )}
            <div>
              <p className="text-[15px] font-semibold text-white/90">Receive {asset}</p>
              <p className="text-[12px] text-white/35">
                {asset === "NGN" ? "Bank transfer · Nigeria" : "Crypto wallet"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition">
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        {asset === "NGN" && (
          <div className="space-y-3">
            {vba ? (
              <>
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] divide-y divide-white/[0.06]">
                  <div className="px-4 py-3.5">
                    <p className="text-[11px] text-white/35 mb-0.5">Bank</p>
                    <p className="text-[14px] font-semibold text-white/85">{vba.bankName}</p>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <div>
                      <p className="text-[11px] text-white/35 mb-0.5">Account number</p>
                      <p className="text-[24px] font-bold tracking-widest text-white tabular-nums">{vba.accountNumber}</p>
                    </div>
                    <CopyButton value={vba.accountNumber} label="Copy" />
                  </div>
                  <div className="px-4 py-3.5">
                    <p className="text-[11px] text-white/35 mb-0.5">Account name</p>
                    <p className="text-[14px] font-semibold text-white/85">{vba.accountName}</p>
                  </div>
                </div>
                <p className="text-[11px] text-white/30 text-center px-2">
                  Transfer NGN from any Nigerian bank to this account. Funds arrive as NGN in your XPay wallet.
                </p>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/[0.08] py-10 text-center">
                <p className="text-[13px] text-white/40">NGN account not set up yet.</p>
                <p className="text-[12px] text-white/25 mt-1">Complete KYC to activate your Nigerian bank account.</p>
              </div>
            )}
          </div>
        )}

        {(asset === "USDC" || asset === "ETH") && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] divide-y divide-white/[0.06]">
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="min-w-0 flex-1 mr-3">
                  <p className="text-[11px] text-white/35 mb-0.5">XPay handle</p>
                  <p className="text-[15px] font-semibold text-white/85">{username}.xpay</p>
                </div>
                <CopyButton value={`${username}.xpay`} label="Copy" />
              </div>
              {walletAddress && (
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-[11px] text-white/35 mb-0.5">Wallet address</p>
                    <p className="text-[12px] font-mono text-white/60 break-all">{walletAddress}</p>
                  </div>
                  <CopyButton value={walletAddress} label="Copy" />
                </div>
              )}
            </div>
            <p className="text-[11px] text-white/30 text-center px-2">
              {asset === "USDC"
                ? "Send USDC to your wallet address on any supported chain."
                : "Send ETH to your wallet address on the correct network."}
            </p>
          </div>
        )}
      </div>
    </div>
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
    <a href={tx.explorerUrl} target="_blank" rel="noreferrer"
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

  // NGN balance + VBA
  const [ngnBalance, setNgnBalance] = useState<string | null>(null);
  const [vba, setVba]               = useState<BmoniVba | null>(null);
  const [receiveModal, setReceiveModal] = useState<"USDC" | "ETH" | "NGN" | null>(null);

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

  const fetchNgn = useCallback(() => {
    const userId = profile?.bmoni_user_id;
    if (!userId) return;
    getBmoniBalance(userId, "CNGN")
      .then(b => setNgnBalance(b ? `₦${parseFloat(b.balance).toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "₦0.00"))
      .catch(() => setNgnBalance("₦0.00"));
  }, [profile?.bmoni_user_id]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.all([refreshBalance(), fetchTx(true), refreshOnChain()]);
    fetchNgn();
    setRefreshing(false);
  }, [refreshing, refreshBalance, fetchTx, refreshOnChain, fetchNgn]);

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

  // Fetch NGN balance + VBA
  useEffect(() => {
    fetchNgn();
    const userId = profile?.bmoni_user_id;
    if (!userId) return;
    const stored = profile?.bmoni_ngn_vba;
    if (stored) {
      setVba({ id: "", accountNumber: stored, bankName: "Providus Bank", accountName: profile?.display_name ?? "", currency: "NGN" });
    } else {
      getNgnDepositAccount(userId).then(v => setVba(v)).catch(() => {});
    }
  }, [profile?.bmoni_user_id]); // eslint-disable-line

  const txUsernames = (transactions ?? [])
    .filter(tx => tx.recipientType === "xpay_user" && tx.recipientUsername)
    .map(tx => tx.recipientUsername as string)
    .filter((u, i, arr) => arr.indexOf(u) === i);
  const feedAvatars = useProfileAvatars(txUsernames);

  if (loading || !authUser || !profile) return <div className="min-h-dvh bg-[#111113]" />;

  const isEthChain  = activeChain.nativeSymbol === "ETH";
  // Show the NGN setup banner when:
  //   - stage is 'profile'  → not yet started (user-initiated)
  //   - stage is 'bmoni_*'  → setup was started but interrupted (resume prompt)
  // Hide once stage is 'complete' (VBA issued successfully).
  const ngnStage = profile.onboarding_stage ?? "profile"
  const ngnNotSetup = ngnStage !== "complete"

  // Where to send the user when they tap the banner
  const ngnSetupPath =
    ngnStage === "bmoni_wallet" || ngnStage === "bmoni_kyc"
      ? "/kyc"
      : ngnStage === "bmoni_user"
      ? "/bmoni-setup"
      : "/bmoni-setup" // 'profile' → fresh start

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

  return (
    <AppShell>
      {/* Receive modal */}
      {receiveModal && (
        <ReceiveModal
          asset={receiveModal}
          walletAddress={effectiveWallet}
          vba={vba}
          username={profile.username}
          onClose={() => setReceiveModal(null)}
        />
      )}

      {/* ── NGN setup banner ── */}
      {ngnNotSetup && (
        <div className="px-5 pt-6 lg:px-6">
          <button
            type="button"
            onClick={() => navigate(ngnSetupPath)}
            className="flex w-full items-center gap-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/60 to-[#111113] px-4 py-4 text-left transition hover:border-emerald-500/50 active:scale-[0.99]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[18px] font-bold text-emerald-400">
              ₦
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-emerald-400">
                {ngnStage === "bmoni_user"
                  ? "Continue wallet setup"
                  : ngnStage === "bmoni_wallet" || ngnStage === "bmoni_kyc"
                  ? "Continue KYC — almost done!"
                  : "Set up your NGN account"}
              </p>
              <p className="text-[11px] text-white/40 mt-0.5">
                {ngnStage === "bmoni_user"
                  ? "Your wallet provisioning was interrupted — tap to resume"
                  : ngnStage === "bmoni_wallet" || ngnStage === "bmoni_kyc"
                  ? "Enter your BVN to activate your Nigerian bank account"
                  : "Activate NGN deposits and withdrawals to any Nigerian bank"}
              </p>
            </div>
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="rgba(16,185,129,0.6)" strokeWidth="2" strokeLinecap="round"><path d="M6 4l4 4-4 4" /></svg>
          </button>
        </div>
      )}

      {/* ── Balance section ── */}
      <div className="px-5 pt-6 pb-5 lg:px-6">
        <div className="rounded-2xl border border-white/[0.07] bg-[#1a1a1c] px-5 py-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/25">Balances</p>
            <div className="flex items-center gap-2.5">
              <button onClick={toggle} className="text-white/25 transition hover:text-white/55">
                {balanceVisible
                  ? <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" /><circle cx="10" cy="10" r="2.5" /></svg>
                  : <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M13.875 13.875A8.963 8.963 0 0110 15c-5.5 0-9-5-9-5a16.47 16.47 0 014.125-4.125M8.25 4.135A8.963 8.963 0 0110 4c5.5 0 9 5 9 5a16.47 16.47 0 01-2.1 2.773M3 3l14 14" /></svg>
                }
              </button>
              <button onClick={handleRefresh} disabled={refreshing || balanceLoading}
                className="text-white/25 transition hover:text-white/55 disabled:opacity-30">
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round"
                  className={refreshing || balanceLoading ? "animate-spin" : ""}>
                  <path d="M4 4a8 8 0 0112 0M16 16a8 8 0 01-12 0M2.5 9.5V5h4.5M17.5 10.5V15h-4.5" />
                </svg>
              </button>
            </div>
          </div>

          {/* 2-column asset grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* NGN */}
            <button
              onClick={() => setReceiveModal("NGN")}
              className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/60 to-[#111113] p-3.5 text-left transition active:scale-[0.97] hover:brightness-110"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-[14px] font-bold text-emerald-400">₦</div>
                <svg viewBox="0 0 16 16" width="9" height="9" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l4 4-4 4" /></svg>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-0.5">NGN</p>
                {ngnBalance === null
                  ? <div className="h-5 w-16 animate-pulse rounded bg-white/[0.08]" />
                  : <p className="text-[15px] font-bold text-white tabular-nums">{balanceVisible ? ngnBalance : "••••"}</p>
                }
                <p className="text-[10px] text-white/25 mt-1">Tap to deposit</p>
              </div>
            </button>

            {/* USDC */}
            <button
              onClick={() => setReceiveModal("USDC")}
              className="flex flex-col gap-3 rounded-xl border border-[#2775CA]/40 bg-gradient-to-br from-[#091828] to-[#111113] p-3.5 text-left transition active:scale-[0.97] hover:brightness-110"
            >
              <div className="flex items-center justify-between">
                <img src={getTokenLogo("USDC")} alt="USDC" className="h-8 w-8 rounded-full" />
                <svg viewBox="0 0 16 16" width="9" height="9" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l4 4-4 4" /></svg>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-0.5">USDC</p>
                {balanceLoading || refreshing
                  ? <div className="h-5 w-16 animate-pulse rounded bg-white/[0.08]" />
                  : <p className="text-[15px] font-bold text-white tabular-nums">{balanceVisible ? (usdcBalance !== null ? formatUSD(usdcBalance) : "$0.00") : "••••"}</p>
                }
                <p className="text-[10px] text-white/25 mt-1">Tap to receive</p>
              </div>
            </button>

            {/* ETH */}
            {isEthChain && (
              <button
                onClick={() => setReceiveModal("ETH")}
                className="col-span-2 flex items-center gap-3 rounded-xl border border-[#627EEA]/35 bg-gradient-to-r from-[#0f1120] to-[#111113] px-4 py-3 text-left transition active:scale-[0.98] hover:brightness-110"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#627EEA]/15">
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path d="M12 2L4 12l8 5 8-5L12 2z" fill="#627EEA" opacity="0.9" />
                    <path d="M4 12l8 10 8-10" fill="#627EEA" opacity="0.5" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{activeChain.nativeSymbol}</p>
                  {balanceLoading || refreshing
                    ? <div className="mt-0.5 h-4 w-20 animate-pulse rounded bg-white/[0.08]" />
                    : <p className="text-[14px] font-bold text-white tabular-nums">{balanceVisible ? (ethBalance !== null ? formatEth(ethBalance) : `0 ${activeChain.nativeSymbol}`) : "••••"}</p>
                  }
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] text-white/25">Tap to receive</p>
                  <svg viewBox="0 0 16 16" width="9" height="9" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-auto mt-1"><path d="M6 4l4 4-4 4" /></svg>
                </div>
              </button>
            )}
          </div>

          {(refreshing || txLoading) && (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/25">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Updating…
            </p>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-5 pb-5 lg:px-6">
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

      {/* Handle + profile */}
      <div className="px-5 pb-5 lg:px-6">
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c]">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3.5">
            <span className="font-mono text-[12px] text-white/30">{profile.username}.xpay</span>
            <CopyButton value={`${profile.username}.xpay`} label="Copy" />
          </div>
          <button onClick={() => navigate("/dashboard")}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:bg-white/[0.025] active:bg-white/[0.04]">
            <div>
              <p className="text-[13px] font-medium text-white/75">Profile &amp; Enrollments</p>
              <p className="text-[11px] text-white/30">View your courses &amp; progress</p>
            </div>
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round"><path d="M6 4l4 4-4 4" /></svg>
          </button>
          {isAdmin && (
            <button onClick={() => navigate("/admin")}
              className="flex w-full items-center justify-between border-t border-white/[0.06] px-4 py-3.5 text-left transition hover:bg-white/[0.025] active:bg-white/[0.04] lg:hidden">
              <p className="text-[13px] font-medium text-violet-300">Admin Panel</p>
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round"><path d="M6 4l4 4-4 4" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="px-5 pt-1 pb-6 lg:px-6">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/25">Recent</p>
          {feedItems.length > 0 && (
            <Link to="/activity" className="text-[12px] font-medium text-white/35 transition hover:text-white/60">See all</Link>
          )}
        </div>

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

        {transactions !== null && feedItems.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/[0.07] bg-[#1a1a1c] py-12 text-center">
            <p className="text-[14px] font-medium text-white/35">No transactions yet</p>
            <p className="text-[12px] text-white/20">Send or receive to get started</p>
            <button onClick={() => navigate("/send")}
              className="mt-1 rounded-xl bg-emerald-500 px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-400">
              Send money
            </button>
          </div>
        )}

        <div className="space-y-5">
          {groups.map(group => (
            <div key={group.label}>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/20">{group.label}</p>
              <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c]">
                {group.items.map((item, i) =>
                  item.kind === "xpay"
                    ? <TxRow key={item.tx.id} tx={item.tx} last={i === group.items.length - 1}
                        avatarSrc={item.tx.recipientUsername ? feedAvatars.get(item.tx.recipientUsername) : undefined} />
                    : <OnChainTxRow key={item.tx.hash + item.tx.type} tx={item.tx} last={i === group.items.length - 1} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

    </AppShell>
  );
}

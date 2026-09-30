import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/lib/session";
import { Screen } from "@/components/Screen";
import { Avatar } from "@/components/Avatar";
import { useNetwork } from "@/lib/NetworkContext";

export default function Settings() {
  const navigate = useNavigate();
  const { authUser, profile, loading, signOut, walletAddress } = useSession();
  const { activeChain } = useNetwork();

  useEffect(() => {
    if (!loading && !authUser) navigate("/login", { replace: true });
    if (!loading && authUser && !profile) navigate("/onboarding", { replace: true });
  }, [loading, authUser, profile, navigate]);

  if (loading || !authUser || !profile) {
    return <div className="min-h-dvh bg-[#111113]" />;
  }

  const displayName = profile.display_name || profile.username;
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <Screen back onBack={() => navigate("/home")} title="Settings">
      <div className="flex flex-1 flex-col pb-12 pt-4">

        {/* ── Profile preview ── */}
        <button
          onClick={() => navigate("/wallet")}
          className="mb-6 flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-[#1a1a1c] px-5 py-4 text-left transition hover:border-white/[0.14] hover:bg-[#1f1f21] active:scale-[0.99]"
        >
          <Avatar name={displayName} size={52} src={profile.avatar_url} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-white/90">{displayName}</p>
            <p className="mt-0.5 font-mono text-[12px] text-white/35">{profile.username}.xpay</p>
            {profile.email && (
              <p className="mt-0.5 truncate text-[12px] text-white/30">{profile.email}</p>
            )}
          </div>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none"
            stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round">
            <path d="M6 4l4 4-4 4" />
          </svg>
        </button>

        {/* ── Account section ── */}
        <SectionLabel>Account</SectionLabel>
        <div className="mb-6 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c]">
          <SettingsRow
            icon={
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none"
                stroke="rgba(255,255,255,0.5)" strokeWidth="1.75" strokeLinecap="round">
                <circle cx="10" cy="7" r="3" />
                <path d="M3 17a7 7 0 0114 0" />
              </svg>
            }
            label="Profile & display"
            sublabel="Name, avatar, handle"
            onClick={() => navigate("/wallet")}
          />
          <SettingsRow
            icon={
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none"
                stroke="rgba(255,255,255,0.5)" strokeWidth="1.75" strokeLinecap="round">
                <rect x="2" y="5" width="16" height="12" rx="1.5" />
                <path d="M2 10h16M6 5V4a2 2 0 014 0v1" />
              </svg>
            }
            label="Wallet & address"
            sublabel={shortAddress ?? "No wallet yet"}
            onClick={() => navigate("/wallet")}
          />
          <SettingsRow
            icon={
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none"
                stroke="rgba(255,255,255,0.5)" strokeWidth="1.75" strokeLinecap="round">
                <path d="M4 6v8m4-8v8m4-8v8M2 14h16M2 7h16M10 2l8 5H2l8-5z" />
              </svg>
            }
            label="Saved recipients"
            sublabel="Banks and XPay users"
            onClick={() => navigate("/wallet")}
            last
          />
        </div>

        {/* ── Activity section ── */}
        <SectionLabel>Activity</SectionLabel>
        <div className="mb-6 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c]">
          <SettingsRow
            icon={
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none"
                stroke="rgba(255,255,255,0.5)" strokeWidth="1.75" strokeLinecap="round">
                <circle cx="10" cy="10" r="7" />
                <path d="M10 6v4l2.5 2.5" />
              </svg>
            }
            label="Transaction history"
            sublabel="All XPay + on-chain activity"
            onClick={() => navigate("/activity")}
          />
          <SettingsRow
            icon={
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none"
                stroke="rgba(255,255,255,0.5)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 10H3M7 15l-5-5 5-5" />
              </svg>
            }
            label="Receive funds"
            sublabel="Share your address or handle"
            onClick={() => navigate("/receive")}
          />
          <SettingsRow
            icon={
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none"
                stroke="rgba(255,255,255,0.5)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 16L16 4M16 4H8M16 4v8" />
              </svg>
            }
            label="Send money"
            sublabel="USDC to anyone"
            onClick={() => navigate("/send")}
            last
          />
        </div>

        {/* ── Network section ── */}
        <SectionLabel>Network</SectionLabel>
        <div className="mb-6 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c]">
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.05]">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none"
                stroke="rgba(255,255,255,0.5)" strokeWidth="1.75" strokeLinecap="round">
                <circle cx="10" cy="10" r="7" />
                <path d="M10 3a10 10 0 010 14M3 10h14" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white/80">Active network</p>
              <p className="mt-0.5 text-[11px] text-white/35">{activeChain.name}</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {activeChain.isTestnet ? "Testnet" : "Mainnet"}
            </span>
          </div>
        </div>

        {/* ── Sign out ── */}
        <div className="overflow-hidden rounded-2xl border border-red-900/30 bg-red-950/20">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3.5 px-4 py-4 text-left transition hover:bg-red-950/40 active:scale-[0.99]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none"
                stroke="#f87171" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 15l3-5-3-5M16 10H7M10 3H5a2 2 0 00-2 2v10a2 2 0 002 2h5" />
              </svg>
            </span>
            <span className="text-[14px] font-medium text-red-400">Sign out</span>
          </button>
        </div>

        <p className="mt-8 text-center text-[10px] text-white/20">
          Secured by Privy · {activeChain.name}
        </p>
      </div>
    </Screen>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-white/25">
      {children}
    </p>
  );
}

function SettingsRow({
  icon, label, sublabel, onClick, last = false,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick: () => void;
  last?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-white/[0.025] active:bg-white/[0.04]",
        !last ? "border-b border-white/[0.06]" : "",
      ].join(" ")}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.05]">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white/80">{label}</p>
        {sublabel && <p className="mt-0.5 truncate text-[11px] text-white/35">{sublabel}</p>}
      </div>
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none"
        stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round">
        <path d="M6 4l4 4-4 4" />
      </svg>
    </button>
  );
}

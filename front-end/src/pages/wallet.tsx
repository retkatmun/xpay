import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFundWallet } from "@privy-io/react-auth";
import { Screen } from "@/components/Screen";
import { CopyButton } from "@/components/CopyButton";
import { Avatar } from "@/components/Avatar";
import { Spinner } from "@/components/icons";
import { useSession } from "@/lib/session";
import { useNetwork } from "@/lib/NetworkContext";
import { getTokenLogo } from "@/assets/logos";
import { getSavedBeneficiaries, deleteBeneficiary, uploadAvatar, deleteAvatar, updateProfile } from "@/lib/supabase";
import type { SavedBeneficiary } from "@/lib/supabase";

export default function Wallet() {
  const navigate = useNavigate();
  const { authUser, profile, loading, walletAddress, signOut, isAdmin, setProfile } = useSession();
  const { fundWallet } = useFundWallet();
  const { activeChain } = useNetwork();
  const [fundLoading, setFundLoading] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState<SavedBeneficiary[]>([]);
  const [loadingBeneficiaries, setLoadingBeneficiaries] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !authUser) navigate("/login", { replace: true });
    if (!loading && authUser && !profile) navigate("/onboarding", { replace: true });
  }, [loading, authUser, profile, navigate]);

  // Load saved beneficiaries
  useEffect(() => {
    if (!authUser) return;
    setLoadingBeneficiaries(true);
    getSavedBeneficiaries(authUser.id)
      .then(setBeneficiaries)
      .catch(() => setBeneficiaries([]))
      .finally(() => setLoadingBeneficiaries(false));
  }, [authUser]);

  if (loading || !authUser || !profile) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#1a1a1c]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const displayName = profile.display_name || profile.username;
  const displayEmail = authUser.email ?? null;
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !authUser) return
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Image must be under 2 MB.")
      return
    }
    setAvatarUploading(true)
    setAvatarError(null)
    try {
      const url = await uploadAvatar(authUser.id, file)
      // Persist url in profile row so other users see it in search
      await updateProfile(authUser.id, { avatar_url: url })
      // Update local session profile
      if (profile) {
        setProfile({ ...profile, avatar_url: url })
      }
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Upload failed. Try again.")
    } finally {
      setAvatarUploading(false)
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleRemoveAvatar() {
    if (!authUser || !profile?.avatar_url) return
    setAvatarUploading(true)
    setAvatarError(null)
    try {
      await deleteAvatar(authUser.id)
      await updateProfile(authUser.id, { avatar_url: null })
      if (profile) setProfile({ ...profile, avatar_url: null })
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Could not remove photo.")
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleFund = async () => {
    const addr = walletAddress || profile.wallet_address;
    if (!addr) { navigate("/receive"); return; }
    setFundLoading(true);
    try {
      await fundWallet(addr, { chain: { id: activeChain.id }, amount: "50" });
    } catch { /* user cancelled */ }
    finally { setFundLoading(false); }
  };

  const handleDeleteBeneficiary = async (id: string) => {
    await deleteBeneficiary(id).catch(() => null);
    setBeneficiaries(prev => prev.filter(b => b.id !== id));
  };

  return (
    <Screen back onBack={() => navigate("/home")}>
      <div className="flex flex-1 flex-col pb-10">

        {/* ── Profile hero ── */}
        <div className="mb-6 flex flex-col items-center pt-4 text-center">
          {/* Avatar with camera button */}
          <div className="relative mb-4">
            <Avatar name={displayName} size={80} src={profile.avatar_url} />

            {/* Admin star badge */}
            {isAdmin && (
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 ring-2 ring-[#111113]">
                <svg viewBox="0 0 12 12" width="8" height="8" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 1l1.5 3h3l-2.4 1.8.9 3L6 7.2l-3 1.6.9-3L1.5 4h3z"/>
                </svg>
              </span>
            )}

            {/* Camera / upload button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              aria-label="Change profile photo"
              className="absolute -bottom-1 left-0 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#111113] transition hover:bg-emerald-400 active:scale-95 disabled:opacity-60"
            >
              {avatarUploading ? (
                <Spinner className="h-3 w-3 text-white" />
              ) : (
                <svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 10V4a1 1 0 011-1h1.5L5 1.5h4L10.5 3H12a1 1 0 011 1v6a1 1 0 01-1 1H2a1 1 0 01-1-1z"/>
                  <circle cx="7" cy="7" r="1.8"/>
                </svg>
              )}
            </button>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {/* Upload error */}
          {avatarError && (
            <p className="mb-2 text-xs text-red-500">{avatarError}</p>
          )}

          {/* Photo action buttons */}
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {profile.avatar_url ? "Change photo" : "Add photo"}
            </button>
            {profile.avatar_url && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                disabled={avatarUploading}
                className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-500 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>

          <h1 className="text-xl font-bold text-white/90">{displayName}</h1>
          {displayEmail && <p className="mt-0.5 text-sm text-white/40">{displayEmail}</p>}
          <div className="mt-3 flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-[#161618] px-3 py-1">
            <span className="font-mono text-xs font-semibold text-white/60">{profile.username}.xpay</span>
            <CopyButton value={`${profile.username}.xpay`} label="Copy" />
          </div>
        </div>

        <div className="mb-4">
          <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-widest text-white/40">Wallet</p>
          <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm divide-y divide-white/[0.06]">
            {walletAddress ? (
              <>
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
                      <span
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: activeChain.color }}
                      />
                    </div>
                    <div>
                      <p className="text-sm text-white/70 font-medium">Embedded wallet</p>
                      <p className="text-[10px] text-white/40">{activeChain.name} · Privy</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold text-white/60">{shortAddress}</span>
                    <CopyButton value={walletAddress} label="Copy" />
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-white/40">Status</span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/100 animate-pulse" />Active
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3 px-4 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#161618]">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="14" height="9" rx="1.5"/><path d="M1 7h14"/>
                  </svg>
                </div>
                <p className="text-sm text-white/50">No wallet yet. Send or receive funds to create one.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Account details ── */}
        <div className="mb-4">
          <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-widest text-white/40">Account</p>
          <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm divide-y divide-white/[0.06]">
            <Row icon={<UserIcon />} label="Display name" value={displayName} />
            <Row icon={<PhoneIcon />} label="Phone" value={profile.phone} copyable />
            {displayEmail && <Row icon={<EmailIcon />} label="Email" value={displayEmail} truncate />}
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <IconBox><RoleIcon /></IconBox>
                <span className="text-sm text-white/50">Role</span>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                isAdmin ? "bg-purple-500/20 text-purple-400 border border-purple-500/20" : "bg-white/[0.07] text-white/60"
              }`}>
                {isAdmin ? "Admin" : "User"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Fund wallet ── */}
        <div className="mb-4">
          <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-widest text-white/40">Add funds</p>
          <button
            onClick={handleFund}
            disabled={fundLoading}
            className="flex w-full items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-left shadow-sm transition hover:bg-emerald-100 active:scale-[.98] disabled:opacity-60"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 shadow-md shadow-emerald-900/30">
              {fundLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 4v12M4 10h12"/>
                </svg>
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white/90">Fund with card</p>
              <p className="text-xs text-emerald-400">Apple Pay, Google Pay, debit or credit card</p>
            </div>
            <div className="flex items-center gap-1">
              <img src={getTokenLogo("USDC")} alt="USDC" className="h-5 w-5 rounded-full" />
            </div>
          </button>
        </div>

        {/* ── Saved beneficiaries ── */}
        <div className="mb-4">
          <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-widest text-white/40">
            Saved recipients
          </p>
          {loadingBeneficiaries ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-14 rounded-2xl bg-white/[0.07] animate-pulse" />
              ))}
            </div>
          ) : beneficiaries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/[0.08] py-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#161618]">
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM6 13s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H6z"/>
                </svg>
              </div>
              <p className="text-xs text-white/40">No saved recipients yet.<br />They appear here after you send money.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm divide-y divide-white/[0.06]">
              {beneficiaries.map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                    {b.type === "bank_account" ? (
                      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 14h12M2 7h12M2 4l6-2.5L14 4M3 7v7M7 7v7M10 7v7M13 7v7"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 13s-1 0-1-1 1-4 7-4 7 3 7 4-1 1-1 1H2z"/>
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white/90 truncate">{b.label}</p>
                    <p className="text-xs text-white/40 truncate">
                      {b.type === "bank_account"
                        ? `${b.bank_name} · ${b.account_number}`
                        : `${b.xpay_username}.xpay`}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/send?to=${b.type === "xpay_user" ? "@" + b.xpay_username : b.account_number}`)}
                    className="shrink-0 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
                  >
                    Send
                  </button>
                  <button
                    onClick={() => handleDeleteBeneficiary(b.id)}
                    className="shrink-0 rounded-lg bg-red-50 p-1.5 text-red-400 transition hover:bg-red-500/20"
                  >
                    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3l8 8M11 3l-8 8"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Quick actions ── */}
        <div className="mb-4">
          <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-widest text-white/40">Actions</p>
          <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm divide-y divide-white/[0.06]">
            <NavRow label="Transaction history" icon={<HistoryIcon />} onClick={() => navigate("/activity")} />
            {isAdmin && <NavRow label="Admin Panel" icon={<AdminIcon />} onClick={() => navigate("/admin")} purple />}
          </div>
        </div>

        {/* ── Sign out ── */}
        <div className="mt-auto pt-4">
          <button
            onClick={async () => { await signOut(); navigate("/", { replace: true }); }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 py-3.5 text-sm font-semibold text-red-600 transition hover:bg-red-500/20 active:scale-[.98]"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3h3a1 1 0 011 1v8a1 1 0 01-1 1h-3M7 11l4-4-4-4M11 8H2"/>
            </svg>
            Sign out
          </button>
        </div>

        <p className="mt-4 text-center text-[10px] text-white/30">
          Secured by Privy · Embedded wallet on {activeChain.name}
        </p>
      </div>
    </Screen>
  );
}

// ─── Small helper sub-components ─────────────────────────────────────────────

function IconBox({ children }: { children: React.ReactNode }) {
  return <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">{children}</div>;
}

function Row({ icon, label, value, copyable, truncate }: {
  icon: React.ReactNode; label: string; value: string; copyable?: boolean; truncate?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <div className="flex items-center gap-3">
        <IconBox>{icon}</IconBox>
        <span className="text-sm text-white/50">{label}</span>
      </div>
      <div className="flex items-center gap-2 min-w-0 max-w-[55%]">
        <span className={`text-sm font-semibold text-white/90 ${truncate ? "truncate" : ""}`}>{value}</span>
        {copyable && <CopyButton value={value} label="Copy" />}
      </div>
    </div>
  );
}

function NavRow({ label, icon, onClick, purple }: {
  label: string; icon: React.ReactNode; onClick: () => void; purple?: boolean;
}) {
  return (
    <button onClick={onClick} className={`flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:bg-[#161618] ${purple ? "bg-purple-500/10 hover:bg-purple-500/20" : ""}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${purple ? "bg-purple-500/20" : "bg-[#161618]"}`}>
          {icon}
        </div>
        <span className={`text-sm font-medium ${purple ? "text-purple-400" : "text-white/70"}`}>{label}</span>
      </div>
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke={purple ? "#9333ea" : "#9ca3af"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 4l4 4-4 4"/>
      </svg>
    </button>
  );
}

// Icons
const UserIcon = () => <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14s-1 0-1-1 1-4 7-4 7 3 7 4-1 1-1 1H2z"/></svg>;
const PhoneIcon = () => <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2h3l1 3-1.5 1.5a9.05 9.05 0 004 4L11 9l3 1v3a1 1 0 01-1 1A12 12 0 012 3a1 1 0 011-1z"/></svg>;
const EmailIcon = () => <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h12v8H2V4z"/><path d="M2 4l6 5 6-5"/></svg>;
const RoleIcon = () => <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1.5"/></svg>;
const HistoryIcon = () => <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#6b7280" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h10M3 8h10M3 12h6"/></svg>;
const AdminIcon = () => <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#9333ea" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1l1.5 4h4l-3.2 2.3 1.2 4L8 9l-3.5 2.3 1.2-4L2.5 5h4z"/></svg>;

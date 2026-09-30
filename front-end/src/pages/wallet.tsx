import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Screen } from "@/components/Screen";
import { CopyButton } from "@/components/CopyButton";
import { Avatar } from "@/components/Avatar";
import { Spinner } from "@/components/icons";
import { useSession } from "@/lib/session";
import { useNetwork } from "@/lib/NetworkContext";
import { getSavedBeneficiaries, deleteBeneficiary, uploadAvatar, updateProfile } from "@/lib/supabase";
import { invalidateAvatarCache } from "@/lib/useProfileAvatars";
import type { SavedBeneficiary } from "@/lib/supabase";

export default function Wallet() {
  const navigate = useNavigate();
  const { authUser, profile, loading, walletAddress, signOut, isAdmin, setProfile } = useSession();
  const { activeChain } = useNetwork();
  const [beneficiaries, setBeneficiaries] = useState<SavedBeneficiary[]>([]);
  const [loadingBeneficiaries, setLoadingBeneficiaries] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [avatarRemoving, setAvatarRemoving] = useState(false);

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
      <div className="flex min-h-dvh items-center justify-center bg-[#111113]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
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
      await updateProfile(authUser.id, { avatar_url: url })
      if (profile) setProfile({ ...profile, avatar_url: url })
      // Bust the module-level avatar cache so other components re-fetch the new photo
      if (profile) invalidateAvatarCache(profile.username)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Upload failed. Try again.")
    } finally {
      setAvatarUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleAvatarRemove() {
    if (!authUser || !profile?.avatar_url) return
    setAvatarRemoving(true)
    setAvatarError(null)
    try {
      await updateProfile(authUser.id, { avatar_url: null })
      setProfile({ ...profile, avatar_url: null })
      invalidateAvatarCache(profile.username)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Could not remove photo.")
    } finally {
      setAvatarRemoving(false)
    }
  }

  const handleDeleteBeneficiary = async (id: string) => {
    await deleteBeneficiary(id).catch(() => null);
    setBeneficiaries(prev => prev.filter(b => b.id !== id));
  };

  return (
    <Screen back onBack={() => navigate("/home")} title="Profile">
      <div className="flex flex-1 flex-col pb-12">

        {/* ── Avatar section ─────────────────────────────────────────── */}
        <div className="flex flex-col items-center pt-6 pb-8 text-center">
          {/* Avatar */}
          <Avatar name={displayName} size={80} src={profile.avatar_url} />

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleAvatarChange}
          />

          {/* Icon buttons below avatar */}
          <div className="mt-2.5 flex items-center gap-2">
            {/* Camera — change / add photo */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading || avatarRemoving}
              aria-label={profile.avatar_url ? "Change photo" : "Add photo"}
              title={profile.avatar_url ? "Change photo" : "Add photo"}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-white/40 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white/80 disabled:opacity-40"
            >
              {avatarUploading ? (
                <Spinner className="h-3 w-3" />
              ) : (
                <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 12a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1h2l1-2h4l1 2h2a1 1 0 011 1v6z" />
                  <circle cx="8" cy="8.5" r="2" />
                </svg>
              )}
            </button>

            {/* Trash — remove photo (only shown when photo exists) */}
            {profile.avatar_url && (
              <button
                type="button"
                onClick={handleAvatarRemove}
                disabled={avatarUploading || avatarRemoving}
                aria-label="Remove photo"
                title="Remove photo"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-white/40 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
              >
                {avatarRemoving ? (
                  <Spinner className="h-3 w-3" />
                ) : (
                  <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9" />
                  </svg>
                )}
              </button>
            )}
          </div>

          {/* Upload/remove error */}
          {avatarError && (
            <p className="mt-2 text-xs text-red-400">{avatarError}</p>
          )}

          {/* Name */}
          <h1 className="mt-3 text-[1.25rem] font-semibold tracking-tight text-white/90">{displayName}</h1>

          {/* Email */}
          {displayEmail && (
            <p className="mt-1 text-sm text-white/40">{displayEmail}</p>
          )}

          {/* Handle pill — outlined, no background fill */}
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] px-3 py-1">
            <span className="font-mono text-xs text-white/50">{profile.username}.xpay</span>
            <CopyButton value={`${profile.username}.xpay`} label="Copy" />
          </div>
        </div>

        {/* ── Wallet section ──────────────────────────────────────────── */}
        <SectionLabel>Wallet</SectionLabel>
        <div className="border-t border-white/[0.07]">
          {walletAddress ? (
            <div className="flex items-center gap-4 border-b border-white/[0.07] py-4">
              {/* Small wallet icon */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.05]">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="14" height="9" rx="1.5"/><path d="M1 7h14"/>
                </svg>
              </div>
              {/* Label + address */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/80">Embedded wallet</p>
                <p className="mt-0.5 font-mono text-xs text-white/35">{shortAddress}</p>
              </div>
              {/* Active status */}
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Active
              </span>
            </div>
          ) : (
            <div className="border-b border-white/[0.07] py-4">
              <p className="text-sm text-white/40">No wallet yet. Send or receive funds to create one.</p>
            </div>
          )}
        </div>

        {/* ── Account section ─────────────────────────────────────────── */}
        <div className="mt-8">
          <SectionLabel>Account</SectionLabel>
          <div className="border-t border-white/[0.07]">
            <InfoRow label="Display name" value={displayName} />
            <InfoRow label="Phone" value={profile.phone} copyable />
            {displayEmail && <InfoRow label="Email" value={displayEmail} truncate />}
            <div className="flex items-center justify-between border-b border-white/[0.07] py-3.5">
              <span className="text-sm text-white/40">Role</span>
              <span className="text-xs font-medium text-blue-400">
                {isAdmin ? "Admin" : "User"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Saved recipients ────────────────────────────────────────── */}
        <div className="mt-8">
          <SectionLabel>Saved recipients</SectionLabel>
          <div className="border-t border-white/[0.07]">
            {loadingBeneficiaries ? (
              <div className="border-b border-white/[0.07] py-4">
                <div className="h-4 w-32 animate-pulse rounded bg-white/[0.07]" />
              </div>
            ) : beneficiaries.length === 0 ? (
              <div className="border-b border-white/[0.07] py-4 text-center">
                <p className="text-sm text-white/30">No saved recipients yet</p>
              </div>
            ) : (
              beneficiaries.map((b) => (
                <div key={b.id} className="flex items-center gap-3 border-b border-white/[0.07] py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm text-white/80">{b.label}</p>
                    <p className="mt-0.5 truncate text-xs text-white/35">
                      {b.type === "bank_account"
                        ? `${b.bank_name} · ${b.account_number}`
                        : `${b.xpay_username}.xpay`}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/send?to=${b.type === "xpay_user" ? "@" + b.xpay_username : b.account_number}`)}
                    className="shrink-0 text-xs font-medium text-blue-400 transition hover:text-blue-300"
                  >
                    Send
                  </button>
                  <button
                    onClick={() => handleDeleteBeneficiary(b.id)}
                    aria-label="Remove recipient"
                    className="shrink-0 p-1 text-white/20 transition hover:text-red-400"
                  >
                    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                      <path d="M3 3l8 8M11 3l-8 8"/>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Actions section ─────────────────────────────────────────── */}
        <div className="mt-8">
          <SectionLabel>More</SectionLabel>
          <div className="border-t border-white/[0.07]">
            <ActionRow label="Transaction history" onClick={() => navigate("/activity")} />
            {isAdmin && (
              <ActionRow label="Admin panel" onClick={() => navigate("/admin")} accent />
            )}
          </div>
        </div>

        {/* ── Sign out — plain red text ────────────────────────────────── */}
        <div className="mt-10 text-center">
          <button
            onClick={async () => { await signOut(); navigate("/", { replace: true }); }}
            className="text-sm font-medium text-red-500 transition hover:text-red-400"
          >
            Sign out
          </button>
        </div>

        <p className="mt-6 text-center text-[10px] text-white/20">
          Secured by Privy · {activeChain.name}
        </p>
      </div>
    </Screen>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-white/30">
      {children}
    </p>
  );
}

function InfoRow({ label, value, copyable, truncate }: {
  label: string;
  value: string;
  copyable?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.07] py-3.5">
      <span className="shrink-0 text-sm text-white/40">{label}</span>
      <div className="flex min-w-0 items-center gap-2 pl-4">
        <span className={`text-sm text-white/80 ${truncate ? "truncate max-w-[160px]" : ""}`}>
          {value}
        </span>
        {copyable && <CopyButton value={value} label="Copy" />}
      </div>
    </div>
  );
}

function ActionRow({ label, onClick, accent }: {
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between border-b border-white/[0.07] py-4 text-left transition hover:bg-white/[0.02] active:bg-white/[0.04]"
    >
      <span className={`text-sm ${accent ? "text-blue-400" : "text-white/70"}`}>{label}</span>
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 4l4 4-4 4"/>
      </svg>
    </button>
  );
}

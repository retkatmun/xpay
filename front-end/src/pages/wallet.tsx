import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Screen } from "@/components/Screen";
import { CopyButton } from "@/components/CopyButton";
import { Avatar } from "@/components/Avatar";
import { useSession } from "@/lib/session";

export default function Wallet() {
  const navigate = useNavigate();
  const { authUser, profile, loading, walletAddress, signOut, isAdmin } = useSession();

  useEffect(() => {
    if (!loading && !authUser) navigate("/login", { replace: true });
    if (!loading && authUser && !profile) navigate("/onboarding", { replace: true });
  }, [loading, authUser, profile, navigate]);

  if (loading || !authUser || !profile) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const displayName = profile.display_name || profile.username;
  const displayEmail = authUser.email ?? null;

  const handleLogout = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  // Truncate wallet address for display
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;

  return (
    <Screen back onBack={() => navigate("/home")}>
      <div className="flex flex-1 flex-col pb-10">

        {/* ── Profile hero ── */}
        <div className="mb-6 flex flex-col items-center pt-4 text-center">
          <div className="relative mb-4">
            <Avatar name={displayName} size={80} />
            {isAdmin && (
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 ring-2 ring-white">
                <svg viewBox="0 0 12 12" width="8" height="8" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 1l1.5 3h3l-2.4 1.8.9 3L6 7.2l-3 1.6.9-3L1.5 4h3z"/>
                </svg>
              </span>
            )}
          </div>

          <h1 className="text-xl font-bold text-gray-900">{displayName}</h1>
          {displayEmail && (
            <p className="mt-0.5 text-sm text-gray-400">{displayEmail}</p>
          )}
          <div className="mt-3 flex items-center gap-1.5 rounded-full border border-gray-100 bg-gray-50 px-3 py-1">
            <span className="font-mono text-xs font-semibold text-gray-600">@{profile.username}</span>
            <CopyButton value={`@${profile.username}`} label="Copy" />
          </div>
        </div>

        {/* ── Account details ── */}
        <div className="mb-4">
          <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-widest text-gray-400">Account</p>
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-100">

            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14s-1 0-1-1 1-4 7-4 7 3 7 4-1 1-1 1H2z"/>
                  </svg>
                </div>
                <span className="text-sm text-gray-500">Display name</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">{displayName}</span>
            </div>

            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 4a1 1 0 011-1h8a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4z"/>
                    <path d="M3 7h10"/>
                  </svg>
                </div>
                <span className="text-sm text-gray-500">Phone</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{profile.phone}</span>
                <CopyButton value={profile.phone} label="Copy" />
              </div>
            </div>

            {displayEmail && (
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50">
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 4h12v8H2V4z"/>
                      <path d="M2 4l6 5 6-5"/>
                    </svg>
                  </div>
                  <span className="text-sm text-gray-500">Email</span>
                </div>
                <span className="text-sm font-semibold text-gray-900 truncate max-w-[160px]">{displayEmail}</span>
              </div>
            )}

            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="8" r="6"/>
                    <path d="M8 5v3l2 1.5"/>
                  </svg>
                </div>
                <span className="text-sm text-gray-500">Role</span>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                isAdmin ? "bg-purple-50 text-purple-700 border border-purple-100" : "bg-gray-100 text-gray-600"
              }`}>
                {isAdmin ? "Admin" : "User"}
              </span>
            </div>

          </div>
        </div>

        {/* ── Wallet address ── */}
        {walletAddress && (
          <div className="mb-4">
            <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-widest text-gray-400">Wallet</p>
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-100">
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-50">
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#16a34a" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="4" width="14" height="9" rx="1.5"/>
                      <path d="M11 8.5a.5.5 0 110 1 .5.5 0 010-1z" fill="#16a34a"/>
                      <path d="M1 7h14"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Embedded wallet</p>
                    <p className="text-[10px] text-gray-400">Base network · Privy</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-gray-700">{shortAddress}</span>
                  <CopyButton value={walletAddress} label="Copy" />
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-gray-400">Status</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Active
                </span>
              </div>
            </div>
          </div>
        )}

        {/* No wallet yet */}
        {!walletAddress && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-dashed border-gray-200 px-4 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-50">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="14" height="9" rx="1.5"/><path d="M1 7h14"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">No wallet yet</p>
              <p className="text-xs text-gray-400">Your embedded wallet will be created when you send or receive funds.</p>
            </div>
          </div>
        )}

        {/* ── Quick actions ── */}
        <div className="mb-4">
          <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-widest text-gray-400">Actions</p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => navigate("/send")}
              className="flex items-center gap-2.5 rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm transition hover:border-blue-100 hover:bg-blue-50 active:scale-[.97]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 8h12M10 4l4 4-4 4"/>
                </svg>
              </span>
              <span className="text-sm font-semibold text-gray-800">Send</span>
            </button>
            <button
              onClick={() => navigate("/receive")}
              className="flex items-center gap-2.5 rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm transition hover:bg-gray-50 active:scale-[.97]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="#374151" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 8H2M6 12l-4-4 4-4"/>
                </svg>
              </span>
              <span className="text-sm font-semibold text-gray-700">Receive</span>
            </button>
          </div>
        </div>

        {/* ── Admin panel ── */}
        {isAdmin && (
          <div className="mb-4">
            <button
              onClick={() => navigate("/admin")}
              className="flex w-full items-center gap-3 rounded-2xl border border-purple-100 bg-purple-50 px-4 py-3.5 text-left shadow-sm transition hover:bg-purple-100 active:scale-[.98]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-600">
                <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 1l2 5h5l-4 3 1.5 5L9 11l-4.5 3L6 9 2 6h5z"/>
                </svg>
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-purple-900">Admin Panel</p>
                <p className="text-xs text-purple-400">Manage users &amp; roles</p>
              </div>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#9333ea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4l4 4-4 4"/>
              </svg>
            </button>
          </div>
        )}

        {/* ── More ── */}
        <div className="mb-4">
          <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-widest text-gray-400">More</p>
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-100">
            <button
              onClick={() => navigate("/activity")}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#6b7280" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 4h10M3 8h10M3 12h6"/>
                  </svg>
                </div>
                <span className="text-sm text-gray-700">Transaction history</span>
              </div>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4l4 4-4 4"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Sign out ── */}
        <div className="mt-auto pt-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50 py-3.5 text-sm font-semibold text-red-600 transition hover:bg-red-100 active:scale-[.98]"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3h3a1 1 0 011 1v8a1 1 0 01-1 1h-3M7 11l4-4-4-4M11 8H2"/>
            </svg>
            Sign out
          </button>
        </div>

        <p className="mt-4 text-center text-[10px] text-gray-300">
          Secured by Privy · Embedded wallet on Base
        </p>
      </div>
    </Screen>
  );
}

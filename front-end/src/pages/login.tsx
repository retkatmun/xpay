import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { useSession } from "@/lib/session";
import xpayLogo from "@/assets/xpay_logo.png";

export default function Login() {
  const navigate = useNavigate();
  const { ready, authenticated, login } = usePrivy();
  const { authUser, profile, loading, privyLoading } = useSession();

  // ── DEBUG: log state on every render ──────────────────────────────────────
  console.log("[Login] ready:", ready, "| authenticated:", authenticated,
    "| loading:", loading, "| privyLoading:", privyLoading,
    "| authUser:", authUser?.id ?? null, "| profile:", profile?.username ?? null);

  // Already logged in with profile → home.
  // Only redirect once loading is done so we don't jump prematurely.
  useEffect(() => {
    if (!loading && authUser && profile) navigate("/home", { replace: true });
  }, [loading, authUser, profile, navigate]);

  return (
    <div className="flex min-h-dvh flex-col bg-[#111113] text-white">

      {/* Nav */}
      <nav className="flex h-14 items-center justify-between border-b border-white/[0.06] px-5">
        <button onClick={() => navigate("/")} className="flex items-center gap-1.5 text-white/40 hover:text-white/70 transition">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 4l-4 4 4 4"/></svg>
          <span className="text-[13px]">Back</span>
        </button>
        <Link to="/">
          <img src={xpayLogo} alt="XPay" className="h-6 w-auto object-contain brightness-0 invert opacity-80" />
        </Link>
        <div className="w-16" />
      </nav>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">

          <h1 className="text-[32px] font-bold tracking-tight text-white">
            Log in to XPay.
          </h1>
          <p className="mt-2 text-[15px] text-white/40">
            Your email is your account. New here? This opens one.
          </p>

          {/* Show button immediately; disable + show spinner only while Privy SDK inits */}
          <button
            onClick={() => {
              console.log("[Login] button clicked — ready:", ready, "privyLoading:", privyLoading);
              login();
            }}
            disabled={privyLoading}
            className="mt-8 flex h-13 w-full items-center justify-center gap-3 rounded-2xl bg-emerald-500 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-400 active:scale-[.98] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {privyLoading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Loading…
              </>
            ) : (
              <>
                Continue with email
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10h12M12 6l4 4-4 4"/>
                </svg>
              </>
            )}
          </button>

          {/* Trust line */}
          <div className="mt-8 flex items-center gap-2">
            <div className="flex-1 border-t border-white/[0.07]" />
            <span className="text-[12px] text-white/25">secured by Privy</span>
            <div className="flex-1 border-t border-white/[0.07]" />
          </div>

          <p className="mt-6 text-center text-[13px] text-white/30">
            Don't have an account?{" "}
            <button onClick={() => navigate("/onboarding")} className="font-semibold text-emerald-400 hover:text-emerald-300 transition">
              Create one
            </button>
          </p>

          {authenticated && (
            <p className="mt-4 text-center text-[13px] text-white/30">
              Already signed in.{" "}
              <button onClick={() => navigate("/home")} className="font-semibold text-emerald-400 hover:text-emerald-300 transition">
                Go to dashboard
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

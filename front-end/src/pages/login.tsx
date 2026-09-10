import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { useSession } from "@/lib/session";
import xpayLogo from "@/assets/xpay_logo.png";

export default function Login() {
  const navigate = useNavigate();
  const { authUser, profile, loading } = useSession();
  const { ready, authenticated, login } = usePrivy();

  useEffect(() => {
    if (loading) return;
    if (authUser && profile) navigate("/home", { replace: true });
    else if (authUser && !profile) navigate("/onboarding", { replace: true });
  }, [loading, authUser, profile, navigate]);

  // When Privy auth completes, session will pick it up via onAuthStateChange
  useEffect(() => {
    if (!ready) return;
    if (authenticated && !loading) {
      if (profile) navigate("/home", { replace: true });
      else navigate("/onboarding", { replace: true });
    }
  }, [ready, authenticated, loading, profile, navigate]);

  if (!ready || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-50/70 to-transparent" />

      <div className="relative flex flex-1 flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">

          {/* Logo */}
          <div className="mb-10 flex justify-center">
            <img src={xpayLogo} alt="XPay" className="h-12 w-auto object-contain" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Sign in to your XPay account to continue.
          </p>

          <button
            onClick={() => login()}
            className="mt-8 flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-base font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 active:scale-[.98]"
          >
            Sign in to XPay
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10h12M12 6l4 4-4 4" />
            </svg>
          </button>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don't have an account?{" "}
            <button
              type="button"
              onClick={() => navigate("/onboarding")}
              className="font-semibold text-blue-600 hover:underline"
            >
              Create one
            </button>
          </p>

          <p className="mt-10 text-center text-xs text-gray-400">
            Secured by Privy · Wallets on Base
          </p>
        </div>
      </div>
    </div>
  );
}

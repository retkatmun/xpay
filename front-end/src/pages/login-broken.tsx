import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { useSession } from "@/lib/session";
import xpayLogo from "@/assets/xpay_logo.png";

export default function Login() {
  const navigate = useNavigate();
  const { authUser, profile, loading } = useSession();
  const { ready, authenticated, login, logout } = usePrivy();

  // Only redirect if user is fully authenticated AND has a profile
  useEffect(() => {
    if (loading) return;
    if (authUser && profile) {
      navigate("/home", { replace: true });
    } else if (authUser && !profile) {
      navigate("/onboarding", { replace: true });
    }
  }, [loading, authUser, profile, navigate]);

  const handleSignOut = async () => {
    await logout();
    // Page will re-render and show login form after logout
  };

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

          {authenticated ? (
            // Already signed in - show options
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                Already signed in
              </h1>
              <p className="mt-2 text-sm text-gray-500">
                You're currently signed in to XPay.
              </p>

              <div className="mt-8 space-y-3">
                <button
                  onClick={() => navigate("/home")}
                  className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-base font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 active:scale-[.98]"
                >
                  Go to Dashboard
                  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10h12M12 6l4 4-4 4" />
                  </svg>
                </button>

                <button
                  onClick={handleSignOut}
                  className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white text-base font-semibold text-gray-700 transition hover:bg-gray-50 active:scale-[.98]"
                >
                  Sign out & use different account
                  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l4-4-4-4M21 13H9" />
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            // Not signed in - show login form
            <>
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
            </>
          )}

          <p className="mt-10 text-center text-xs text-gray-400">
            Secured by Privy · Wallets on Base
          </p>
        </div>
      </div>
    </div>
  );
}

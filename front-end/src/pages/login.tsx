import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import xpayLogo from "@/assets/xpay_logo.png";

export default function LoginSimple() {
  const navigate = useNavigate();
  const { ready, authenticated, login, logout, user } = usePrivy();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
    setIsLoggingOut(false);
  };

  const handleLogin = () => {
    login();
  };

  const goToDashboard = () => {
    navigate("/home");
  };

  const goToOnboarding = () => {
    navigate("/onboarding");
  };

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-50/70 to-transparent" />

      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="w-full max-w-md">

          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <img src={xpayLogo} alt="XPay" className="h-10 sm:h-12 w-auto object-contain" />
          </div>

          {authenticated ? (
            // Already signed in - show options
            <div className="text-center">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
                Already signed in
              </h1>
              <p className="mt-2 text-sm sm:text-base text-gray-500">
                You're currently signed in to XPay.
              </p>
              
              {user?.email?.address && (
                <p className="mt-2 text-xs text-gray-400 truncate">
                  {user.email.address}
                </p>
              )}

              <div className="mt-8 space-y-3">
                <button
                  onClick={goToDashboard}
                  className="flex h-12 sm:h-14 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-sm sm:text-base font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 active:scale-[.98]"
                >
                  Go to Dashboard
                  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10h12M12 6l4 4-4 4" />
                  </svg>
                </button>

                <button
                  onClick={goToOnboarding}
                  className="flex h-12 sm:h-14 w-full items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white text-sm sm:text-base font-semibold text-gray-700 transition hover:bg-gray-50 active:scale-[.98]"
                >
                  Create New Account
                  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M12.5 7.5a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </button>

                <button
                  onClick={handleSignOut}
                  disabled={isLoggingOut}
                  className="flex h-12 sm:h-14 w-full items-center justify-center gap-3 rounded-2xl border border-red-200 bg-red-50 text-sm sm:text-base font-semibold text-red-700 transition hover:bg-red-100 active:scale-[.98] disabled:opacity-50"
                >
                  {isLoggingOut ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-700 border-t-transparent" />
                      Signing out...
                    </>
                  ) : (
                    <>
                      Sign out
                      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l4-4-4-4M21 13H9" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            // Not signed in - show login form
            <div className="text-center">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
                Welcome back
              </h1>
              <p className="mt-2 text-sm sm:text-base text-gray-500">
                Sign in to your XPay account to continue.
              </p>

              <button
                onClick={handleLogin}
                className="mt-8 flex h-12 sm:h-14 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-sm sm:text-base font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 active:scale-[.98]"
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
                  onClick={goToOnboarding}
                  className="font-semibold text-blue-600 hover:underline"
                >
                  Create one
                </button>
              </p>
            </div>
          )}

          <p className="mt-8 sm:mt-10 text-center text-xs text-gray-400">
            Secured by Privy · Wallets on Base
          </p>
        </div>
      </div>
    </div>
  );
}

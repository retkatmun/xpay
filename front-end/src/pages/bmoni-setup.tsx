/**
 * BmoniWalletSetup — forced screen for onboarding_stage = 'profile' | 'bmoni_user'
 *
 * Users land here automatically after XPay profile creation and cannot
 * access the rest of the app until this completes.
 *
 * What it does:
 *   Stage 1: POST /v1/users           → bmoni_user_id  (stage: profile → bmoni_user)
 *   Stage 2: create-managed wallet    → bmoni_wallet_id (stage: bmoni_user → bmoni_wallet)
 *
 * On completion it navigates to /kyc for BVN + Nigeria rail.
 */

import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useSessionSafe } from "@/lib/session"
import { useBmoniSetup } from "@/lib/useBmoniSetup"
import { Spinner } from "@/components/icons"
import xpayLogo from "@/assets/xpay_logo.png"

function Step({ done, active, label }: { done: boolean; active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={[
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all",
        done
          ? "bg-emerald-500 text-white"
          : active
          ? "bg-emerald-500/20 ring-2 ring-emerald-500 text-emerald-400"
          : "bg-white/[0.07] text-white/30",
      ].join(" ")}>
        {done
          ? <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6l3 3 5-5" />
            </svg>
          : active
          ? <Spinner className="h-3.5 w-3.5" />
          : null}
      </div>
      <span className={[
        "text-sm font-medium",
        done ? "text-emerald-400" : active ? "text-white/90" : "text-white/30",
      ].join(" ")}>{label}</span>
    </div>
  )
}

export default function BmoniWalletSetup() {
  const navigate = useNavigate()
  const session = useSessionSafe()
  const profile = session?.profile ?? null
  const setProfile = session?.setProfile ?? (() => {})

  const { status, error, setupWallet } = useBmoniSetup(
    profile,
    (updated) => setProfile(profile ? { ...profile, ...updated } : null),
  )

  const stage = profile?.onboarding_stage ?? "profile"

  // Don't render or auto-start until session is loaded
  const sessionLoading = !session || session.loading

  // Auto-advance when wallet provisioned — go straight to KYC
  useEffect(() => {
    if (sessionLoading) return
    if (stage === "bmoni_wallet" || stage === "bmoni_kyc" || stage === "complete") {
      navigate("/kyc", { replace: true })
    }
  }, [stage, navigate, sessionLoading])

  // Auto-start on mount — but only once session is ready
  useEffect(() => {
    if (sessionLoading) return
    if (status === "idle" && (stage === "profile" || stage === "bmoni_user")) {
      void setupWallet()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading]) // re-run when session becomes available

  const creatingUser = status === "creating_user"
  const provWallet   = status === "provisioning_wallet"
  const userDone     = ["bmoni_user", "bmoni_wallet", "bmoni_kyc", "complete"].includes(stage)
  const walletDone   = ["bmoni_wallet", "bmoni_kyc", "complete"].includes(stage)

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#111113] px-6 text-white">
      <div className="w-full max-w-sm">

        <div className="mb-10 flex justify-center">
          <img src={xpayLogo} alt="XPay" className="h-10 w-auto brightness-0 invert opacity-90" />
        </div>

        {sessionLoading ? (
          <div className="flex flex-col items-center gap-4 py-10">
            <Spinner className="h-6 w-6 text-white/30" />
            <p className="text-sm text-white/40">Loading your session…</p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-white/90">
              Setting up your wallet
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              We're creating your secure NGN wallet. This only happens once — your progress is
              saved so you can pick up where you left off on any device.
            </p>

            <div className="mt-10 space-y-4">
              <Step done={userDone}   active={creatingUser} label="Creating your BMONI account" />
              <Step done={walletDone} active={provWallet}   label="Provisioning your smart wallet" />
              <Step done={false}      active={false}        label="Activate NGN rail (next step)" />
            </div>

            <div className="mt-8 min-h-[3rem] rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-center">
              {error ? (
                <div className="space-y-3">
                  <p className="text-sm text-red-400">{error}</p>
                  <button
                    onClick={() => void setupWallet()}
                    className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <p className="text-sm text-white/40">
                  {creatingUser    ? "Creating your account…"
                  : provWallet     ? "Signing wallet challenge with your key…"
                  : status === "done" ? "Wallet ready — advancing…"
                  : "Starting setup…"}
                </p>
              )}
            </div>

            <p className="mt-6 text-center text-xs text-white/25">
              Do not close this screen. Your progress is saved automatically.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

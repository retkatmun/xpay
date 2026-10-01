/**
 * Stage 2: Provision the smart wallet
 *
 * Part of the mandatory 6-stage BMONI lifecycle:
 *   Stage 1 (User)   — BMONI user created here via POST /v1/users
 *   Stage 2 (Wallet) — smart wallet provisioned here (owner-proof + create-managed)
 *   Stage 3+4        — /kyc  (BVN → PATCH /kyc → POST /onboarding/start-nigeria → VBA)
 *   Stage 5+6        — /home (fund + move money)
 *
 * Auto-starts on mount. No "skip" — every user must complete this before /home.
 */

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useSessionSafe } from "@/lib/session"
import { useBmoniSetup } from "@/lib/useBmoniSetup"
import { Spinner } from "@/components/icons"
import xpayLogo from "@/assets/xpay_logo.png"

function StageStep({
  number, done, active, label, sub,
}: { number: number; done: boolean; active: boolean; label: string; sub: string }) {
  return (
    <div className="flex items-start gap-4">
      <div className={[
        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all",
        done  ? "bg-emerald-500 text-white"
             : active ? "bg-emerald-500/20 ring-2 ring-emerald-500 text-emerald-400"
             : "bg-white/[0.07] text-white/30",
      ].join(" ")}>
        {done ? (
          <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6l3 3 5-5" />
          </svg>
        ) : active ? <Spinner className="h-3.5 w-3.5" /> : number}
      </div>
      <div className="min-w-0 flex-1">
        <p className={["text-sm font-semibold", done ? "text-emerald-400" : active ? "text-white/90" : "text-white/30"].join(" ")}>
          {label}
        </p>
        <p className={["mt-0.5 text-xs", done || active ? "text-white/40" : "text-white/20"].join(" ")}>
          {sub}
        </p>
      </div>
    </div>
  )
}

export default function BmoniWalletSetup() {
  const navigate = useNavigate()
  const session = useSessionSafe()
  const profile    = session?.profile    ?? null
  const setProfile = session?.setProfile ?? (() => {})
  const sessionLoading = !session || session.loading

  const { status, error, setupWallet } = useBmoniSetup(
    profile,
    (updated) => setProfile(profile ? { ...profile, ...updated } : null),
  )

  const stage = profile?.onboarding_stage ?? "profile"
  const [autoStarted, setAutoStarted] = useState(false)

  // Auto-start as soon as session is ready — covers first-time and resumed users
  useEffect(() => {
    if (sessionLoading || autoStarted || status !== "idle") return
    if (profile?.bmoni_user_id && profile?.bmoni_wallet_id) return // already done
    setAutoStarted(true)
    void setupWallet()
  }, [sessionLoading, status, autoStarted, profile, setupWallet])

  // Forward to KYC (Stage 3) once wallet is provisioned
  useEffect(() => {
    if (sessionLoading) return
    if (["bmoni_wallet", "bmoni_kyc", "complete"].includes(stage)) {
      navigate("/kyc", { replace: true })
    }
  }, [stage, navigate, sessionLoading])

  const creatingUser = status === "creating_user"
  const provWallet   = status === "provisioning_wallet"
  const userDone     = ["bmoni_user", "bmoni_wallet", "bmoni_kyc", "complete"].includes(stage)
  const walletDone   = ["bmoni_wallet", "bmoni_kyc", "complete"].includes(stage)

  if (sessionLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#111113]">
        <Spinner className="h-6 w-6 text-white/30" />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#111113] px-6 text-white">
      <div className="w-full max-w-sm">

        <div className="mb-10 flex justify-center">
          <img src={xpayLogo} alt="XPay" className="h-10 w-auto brightness-0 invert opacity-90" />
        </div>

        {/* Step badge */}
        <div className="mb-3">
          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
            Step 2 of 4
          </span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-white/90">
          Setting up your wallet
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          Your secure NGN smart wallet is being created. This happens once —
          your progress is saved if you close the app.
        </p>

        <div className="mt-8 space-y-5">
          <StageStep number={1} done={userDone}   active={creatingUser}
            label="Create BMONI account"
            sub="Registers you with the payment network" />
          <StageStep number={2} done={walletDone} active={provWallet}
            label="Provision smart wallet"
            sub="Owner-proof challenge → deploy managed wallet (CNGN)" />
          <StageStep number={3} done={false} active={false}
            label="Verify identity (BVN)"
            sub="Next — takes 1 minute with your BVN" />
          <StageStep number={4} done={false} active={false}
            label="Activate NGN rail"
            sub="Your virtual bank account is issued automatically" />
        </div>

        <div className="mt-8 min-h-[3.5rem] rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-center">
          {error ? (
            <div className="space-y-3">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={() => void setupWallet()}
                className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 active:scale-[.98]"
              >
                Retry
              </button>
            </div>
          ) : (
            <p className="text-sm text-white/40">
              {creatingUser       ? "Creating your account…"
              : provWallet        ? "Signing wallet challenge with Privy…"
              : status === "done" ? "Wallet ready — moving to verification…"
              : "Preparing…"}
            </p>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-white/25">
          Do not close this screen. Your progress is saved automatically.
        </p>

      </div>
    </div>
  )
}

/**
 * BmoniWalletSetup — screen for setting up the NGN account.
 *
 * Reached voluntarily from the home page banner (or automatically if
 * onboarding_stage is 'bmoni_user', meaning setup was started but interrupted).
 *
 * What it does:
 *   Stage 1: POST /v1/users           → bmoni_user_id  (stage: profile → bmoni_user)
 *   Stage 2: create-managed wallet    → bmoni_wallet_id (stage: bmoni_user → bmoni_wallet)
 *
 * On completion it navigates to /kyc for BVN + Nigeria rail.
 */

import { useEffect, useState } from "react"
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
  const sessionLoading = !session || session.loading

  // Track whether setup has been started this session
  const [started, setStarted] = useState(false)

  // If stage is already bmoni_user (setup was started but wallet not yet
  // provisioned — e.g. user closed the app mid-way), auto-resume.
  useEffect(() => {
    if (sessionLoading) return
    if (stage === "bmoni_user" && status === "idle" && !started) {
      setStarted(true)
      void setupWallet()
    }
  }, [sessionLoading, stage, status, started, setupWallet])

  // Auto-advance once wallet is provisioned → go to KYC
  useEffect(() => {
    if (sessionLoading) return
    if (stage === "bmoni_wallet" || stage === "bmoni_kyc" || stage === "complete") {
      navigate("/kyc", { replace: true })
    }
  }, [stage, navigate, sessionLoading])

  const creatingUser = status === "creating_user"
  const provWallet   = status === "provisioning_wallet"
  const userDone     = ["bmoni_user", "bmoni_wallet", "bmoni_kyc", "complete"].includes(stage)
  const walletDone   = ["bmoni_wallet", "bmoni_kyc", "complete"].includes(stage)

  // ── Intro screen (not yet started) ─────────────────────────────────────────
  const showIntro = !started && stage === "profile" && status === "idle"

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

        ) : showIntro ? (
          /* ── Intro: explain what's about to happen, let user confirm ── */
          <>
            <div className="flex justify-center mb-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 ring-8 ring-emerald-500/10">
                <span className="text-[32px] font-bold text-emerald-400">₦</span>
              </div>
            </div>

            <h1 className="text-center text-2xl font-bold tracking-tight text-white/90">
              Set up your NGN account
            </h1>
            <p className="mt-3 text-center text-sm leading-relaxed text-white/50">
              Activate your Nigerian Naira account to receive deposits directly from any
              Nigerian bank and withdraw to any bank account.
            </p>

            <div className="mt-8 space-y-3.5">
              {[
                { icon: "🔐", title: "Create your BMONI wallet", desc: "A secure smart wallet is provisioned in seconds." },
                { icon: "🪪", title: "Verify your identity (BVN)", desc: "Your 11-digit BVN activates the NGN rail." },
                { icon: "🏦", title: "Get your virtual bank account", desc: "Receive NGN from any Nigerian bank instantly." },
              ].map(item => (
                <div key={item.title} className="flex items-start gap-3.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5">
                  <span className="text-xl">{item.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-white/80">{item.title}</p>
                    <p className="mt-0.5 text-xs text-white/40">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => { setStarted(true); void setupWallet() }}
              className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-semibold text-white shadow-sm shadow-emerald-900/30 transition hover:bg-emerald-400 active:scale-[.98]"
            >
              Set up NGN account
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M6 4l4 4-4 4" /></svg>
            </button>

            <button
              onClick={() => navigate("/home")}
              className="mt-3 w-full rounded-xl py-3 text-sm text-white/35 transition hover:text-white/60"
            >
              Maybe later
            </button>
          </>

        ) : (
          /* ── Setup in progress / error ── */
          <>
            <h1 className="text-2xl font-bold tracking-tight text-white/90">
              Setting up your wallet
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              We're creating your secure NGN wallet. This only happens once — your
              progress is saved so you can pick up where you left off.
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

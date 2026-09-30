/**
 * BMONI KYC + Nigeria Rail Setup Screen
 *
 * Flow (matches https://bkey.mintlify.app/api-reference/kyc-nga-requirements):
 *   1. Collect BVN → look up persona details (GET /kyc/bvn-lookup/:bvn)
 *   2. Confirm details + address
 *   3. POST /onboarding/start-nigeria  (BVN does identity verification — no /kyc/activate needed)
 *   4. GET  /bank-accounts/deposit-accounts/NGN → persist VBA
 *
 * Sandbox BVNs:
 *   95888168924 → Bunch Dillon  (user must have been created with this name)
 *   22222222222 → Samson Jabo   (user must have been created with this name)
 */

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Screen, Title } from "@/components/Screen"
import { Button } from "@/components/Button"
import { Spinner } from "@/components/icons"
import {
  lookupBvn,
  startNigeriaOnboarding,
  getNgnDepositAccount,
  BmoniError,
} from "@/lib/bmoni"
import { updateProfile } from "@/lib/supabase"
import { useSessionSafe } from "@/lib/session"
import type { XPayProfile } from "@/lib/session"

const INPUT_CLASS =
  "h-12 w-full rounded-xl border border-white/[0.08] bg-[#111113] px-4 text-sm text-white/90 outline-none transition placeholder:text-white/40 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
const LABEL_CLASS = "mb-1.5 block text-sm font-semibold text-white/70"

type Step = "bvn" | "confirm" | "submitting" | "done"

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3">
      <svg className="mt-0.5 shrink-0" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round">
        <circle cx="8" cy="8" r="7" /><path d="M8 5v3.5M8 11h.01" />
      </svg>
      <p className="text-sm text-red-400">{message}</p>
    </div>
  )
}

function InfoBox({ message }: { message: string }) {
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-blue-500/30 bg-blue-950/30 px-4 py-3">
      <svg className="mt-0.5 shrink-0" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round">
        <circle cx="8" cy="8" r="7" /><path d="M8 7v5M8 5h.01" />
      </svg>
      <p className="text-sm text-blue-300">{message}</p>
    </div>
  )
}

export default function KycSetup() {
  const navigate = useNavigate()
  const session = useSessionSafe()
  const authUser = session?.authUser ?? null
  const profile  = session?.profile  ?? null
  const setProfile = session?.setProfile ?? (() => {})

  const [step, setStep]       = useState<Step>("bvn")
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // BVN
  const [bvn, setBvn]             = useState("")
  const [lookingUp, setLookingUp] = useState(false)

  // Pre-filled from BVN lookup (read-only display)
  const [personaName, setPersonaName] = useState("")
  const [personaDob, setPersonaDob]   = useState("")

  // Address inputs
  const [streetLine1, setStreetLine1] = useState("")
  const [city, setCity]               = useState("")
  const [stateName, setStateName]     = useState("")
  const [postalCode, setPostalCode]   = useState("")

  const bmoniUserId      = profile?.bmoni_user_id  ?? null
  const smartWalletAddr  = profile?.wallet_address ?? null

  // If resuming at bmoni_kyc stage, still start at BVN — user re-enters it,
  // but we skip the BVN lookup and go straight to address step.
  const isResuming = profile?.onboarding_stage === "bmoni_kyc"

  // Show loading screen until session is ready
  if (!session || session.loading) return <div className="min-h-dvh bg-[#111113]" />

  if (!authUser || !profile) return <div className="min-h-dvh bg-[#111113]" />

  if (!bmoniUserId) {
    return (
      <Screen back onBack={() => navigate(-1)}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5">
          <p className="text-center text-sm text-white/50">
            Wallet setup not yet complete. Please go back and tap "Set up wallet" first.
          </p>
          <Button onClick={() => navigate("/home")}>Go to home</Button>
        </div>
      </Screen>
    )
  }

  // ── BVN lookup ─────────────────────────────────────────────────────────────
  async function handleBvnLookup() {
    const clean = bvn.replace(/\D/g, "")
    if (clean.length !== 11) { setError("Enter your 11-digit BVN."); return }
    if (!bmoniUserId) return
    setError(null)

    // If resuming (already at bmoni_kyc), skip the lookup API call — just go to address
    if (isResuming) {
      setPersonaName("") // won't be shown
      setStep("confirm")
      return
    }

    setLookingUp(true)
    try {
      const result = await lookupBvn(bmoniUserId, clean)
      setPersonaName(`${result.firstName} ${result.lastName}`.trim())
      setPersonaDob(result.dateOfBirth || "")
      // Mark stage so returning users land back on confirm step
      if (profile?.onboarding_stage === "bmoni_wallet") {
        await updateProfile(profile.id, { onboarding_stage: "bmoni_kyc" })
        setProfile({ ...profile, onboarding_stage: "bmoni_kyc" })
      }
      setStep("confirm")
    } catch (err) {
      if (err instanceof BmoniError && err.status === 404) {
        setError(
          "BVN not found in sandbox. Use 95888168924 (Bunch Dillon) or 22222222222 (Samson Jabo)."
        )
      } else {
        setError(err instanceof Error ? err.message : "BVN lookup failed.")
      }
    } finally {
      setLookingUp(false)
    }
  }

  // ── Submit (start-nigeria) ─────────────────────────────────────────────────
  async function handleSubmit() {
    if (!streetLine1.trim() || !city.trim() || !stateName.trim()) {
      setError("Please fill in street, city, and state."); return
    }
    if (postalCode.replace(/\D/g, "").length !== 6) {
      setError("Postal code must be exactly 6 digits."); return
    }

    // wallet_address is the smart wallet on-chain address written by bmoni-setup Stage 2.
    // If the session profile is stale (e.g. HMR), refetch from DB before giving up.
    let walletAddr = smartWalletAddr
    if (!walletAddr && profile) {
      try {
        const { fetchProfileById } = await import("@/lib/supabase")
        const fresh = await fetchProfileById(profile.id) as XPayProfile | null
        walletAddr = fresh?.wallet_address ?? null
        if (fresh) setProfile(fresh)
      } catch { /* ignore, will fail below */ }
    }

    if (!walletAddr) {
      setError("Smart wallet address missing. Please go back and set up your wallet again."); return
    }

    setError(null)
    setBusy(true)
    setStep("submitting")

    const uid      = bmoniUserId as string   // non-null: guarded above
    const cleanBvn = bvn.replace(/\D/g, "")

    try {
      // POST /onboarding/start-nigeria — BVN verifies identity + issues VBA
      // ngnWalletAddress = smart wallet on-chain address (from createManagedWallet)
      try {
        await startNigeriaOnboarding(uid, cleanBvn, walletAddr as string, 0)
      } catch (err) {
        // 400 / 409 = already started → continue to VBA fetch
        if (!(err instanceof BmoniError && (err.status === 400 || err.status === 409))) {
          throw err
        }
      }

      // Persist rail_active
      await updateProfile(profile!.id, { bmoni_onboarding_status: "rail_active", onboarding_stage: "complete" })

      // Fetch VBA — retry up to 3 times (async provisioning)
      let vbaNumber: string | null = null
      for (let i = 0; i < 3; i++) {
        try {
          const vba = await getNgnDepositAccount(uid)
          if (vba.accountNumber) { vbaNumber = vba.accountNumber; break }
        } catch { /* not ready yet */ }
        if (i < 2) await new Promise(r => setTimeout(r, 2000))
      }

      const updated = await updateProfile(profile!.id, {
        bmoni_onboarding_status: "rail_active",
        onboarding_stage: "complete",
        ...(vbaNumber ? { bmoni_ngn_vba: vbaNumber } : {}),
      })
      setProfile(updated as XPayProfile)
      setStep("done")
    } catch (err) {
      const msg = err instanceof BmoniError
        ? `BMONI (${err.code}): ${err.message}`
        : err instanceof Error ? err.message
        : "Setup failed. Please try again."
      setError(msg)
      setBusy(false)
      setStep("confirm")
    }
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <Screen back onBack={() => navigate("/home")}>
        <div className="flex flex-1 flex-col items-center justify-center text-center px-5 py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 ring-8 ring-emerald-500/10">
            <svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 24l10 10 18-20" />
            </svg>
          </div>
          <h1 className="mt-6 text-2xl font-bold text-white/90">NGN Wallet Active!</h1>
          <p className="mt-2 text-sm text-white/50">
            You can now receive NGN deposits and withdraw to any Nigerian bank.
          </p>
          <div className="mt-8 w-full">
            <Button full size="lg" onClick={() => navigate("/home")}>Go to home</Button>
          </div>
        </div>
      </Screen>
    )
  }

  // ── Submitting ─────────────────────────────────────────────────────────────
  if (step === "submitting") {
    return (
      <Screen back onBack={() => {}}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5">
          <Spinner className="h-8 w-8 text-emerald-400" />
          <p className="text-sm text-white/60">Activating your NGN wallet…</p>
          <p className="text-xs text-white/30">Do not close this screen.</p>
        </div>
      </Screen>
    )
  }

  return (
    <Screen back onBack={() => { if (step === "confirm") { setStep("bvn"); setError(null) } else navigate(-1) }}>
      <div className="flex flex-1 flex-col pt-4 pb-10 px-1">

        {/* Progress */}
        <div className="mb-8 flex gap-1.5">
          {["bvn", "confirm"].map((s, i) => (
            <div key={s} className={["h-1 flex-1 rounded-full transition-all duration-300",
              (step === "bvn" ? 0 : 1) >= i ? "bg-emerald-500" : "bg-white/[0.08]"].join(" ")} />
          ))}
        </div>

        {/* ── BVN step ──────────────────────────────────────────────── */}
        {step === "bvn" && (
          <div>
            <Title sub="Your BVN is required to activate your Nigerian bank rail.">
              Bank Verification Number
            </Title>

            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
              <p className="text-xs text-amber-300">
                Your 11-digit BVN is issued by the Central Bank of Nigeria.
                <strong className="block mt-1 text-amber-200">
                  Sandbox: 95888168924 (Bunch Dillon) or 22222222222 (Samson Jabo)
                </strong>
              </p>
            </div>

            <div className="mt-6">
              <label className={LABEL_CLASS}>BVN (11 digits)</label>
              <input
                value={bvn}
                onChange={e => { setBvn(e.target.value.replace(/\D/g, "").slice(0, 11)); setError(null) }}
                inputMode="numeric"
                placeholder="95888168924"
                maxLength={11}
                autoFocus
                className={INPUT_CLASS}
              />
              <p className={`mt-1.5 text-xs ${bvn.length === 11 ? "text-emerald-400" : "text-white/30"}`}>
                {bvn.length}/11 digits{bvn.length === 11 ? " ✓" : ""}
              </p>
            </div>

            {error && <ErrorBox message={error} />}

            <div className="mt-8">
              <Button
                full size="lg"
                disabled={lookingUp || bvn.replace(/\D/g, "").length !== 11}
                loading={lookingUp}
                onClick={handleBvnLookup}
              >
                {lookingUp ? "Looking up BVN…" : "Continue"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Confirm + address step ─────────────────────────────────── */}
        {step === "confirm" && (
          <div>
            <Title sub="Add your Nigerian residential address to activate the NGN rail.">
              Address details
            </Title>

            <InfoBox message="Details were pre-filled from your BVN. Fill in your address to continue." />

            <div className="mt-6 space-y-4">
              {/* Read-only persona summary — only shown when we did the BVN lookup this session */}
              {personaName && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-2">From BVN {bvn}</p>
                  <p className="text-sm text-white/80"><span className="text-white/40">Name: </span>{personaName}</p>
                  {personaDob && <p className="text-sm text-white/80"><span className="text-white/40">DOB: </span>{personaDob}</p>}
                </div>
              )}

              <div>
                <label className={LABEL_CLASS}>Street address *</label>
                <input
                  value={streetLine1}
                  onChange={e => { setStreetLine1(e.target.value); setError(null) }}
                  placeholder="15 Adeola Odeku Street"
                  autoFocus
                  className={INPUT_CLASS}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLASS}>City *</label>
                  <input value={city} onChange={e => { setCity(e.target.value); setError(null) }}
                    placeholder="Lagos" className={INPUT_CLASS} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>State *</label>
                  <input value={stateName} onChange={e => setStateName(e.target.value)}
                    placeholder="Lagos State" className={INPUT_CLASS} />
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>Postal code * (6 digits)</label>
                <input
                  value={postalCode}
                  onChange={e => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="100001"
                  maxLength={6}
                  className={INPUT_CLASS}
                />
                <p className={`mt-1 text-xs ${postalCode.length === 6 ? "text-emerald-400" : "text-white/30"}`}>
                  {postalCode.length}/6 digits{postalCode.length === 6 ? " ✓" : ""}
                </p>
              </div>
            </div>

            {error && <ErrorBox message={error} />}

            <div className="mt-8">
              <Button
                full size="lg"
                disabled={busy || !streetLine1.trim() || !city.trim() || !stateName.trim() || postalCode.length !== 6}
                loading={busy}
                onClick={handleSubmit}
              >
                Activate NGN wallet
              </Button>
            </div>
          </div>
        )}
      </div>
    </Screen>
  )
}

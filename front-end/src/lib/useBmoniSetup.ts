/**
 * useBmoniSetup — orchestrates the full BMONI NGN onboarding lifecycle.
 *
 * Correct flow (per https://bkey.mintlify.app/api-reference/integration-flow):
 *
 *   setupWallet()  →  Stage 1: Create BMONI user  (with sandbox persona names)
 *                  →  Stage 2: Provision smart wallet (Privy keypair as owner)
 *
 *   startNigeria() →  Stage 3: POST /onboarding/start-nigeria  (BVN verifies identity)
 *                  →  Stage 4: GET  /bank-accounts/deposit-accounts/NGN  (fetch VBA)
 *
 * NOTE: /kyc/activate is NOT needed for Nigeria NGN.
 *       BVN verification inside start-nigeria handles it.
 *
 * SANDBOX RULE: firstName/lastName/phoneNumber on createBmoniUser MUST match
 * a test persona exactly — otherwise start-nigeria will fail with server_error.
 *   Persona 1 → firstName:"Bunch"  lastName:"Dillon"  phone:+2348000000000  BVN:95888168924
 *   Persona 2 → firstName:"Samson" lastName:"Jabo"    phone:+2348000000001  BVN:22222222222
 * We always use Persona 1 in sandbox (BMONI_SANDBOX_PERSONA).
 */

import { useState, useCallback } from "react"
import { useWallets } from "@privy-io/react-auth"
import {
  createBmoniUser,
  provisionSmartWallet,
  getOnboardingStatus,
  startNigeriaOnboarding,
  getNgnDepositAccount,
  BmoniError,
} from "@/lib/bmoni"
import { updateProfile } from "@/lib/supabase"
import type { XPayProfile } from "@/lib/session"

// ── Sandbox test persona (must match exactly) ─────────────────────────────────
// Switch to real user data in production.
const SANDBOX = import.meta.env.DEV || import.meta.env.VITE_BMONI_BASE_URL?.includes("dev")
const PERSONA = {
  firstName:   "Bunch",
  lastName:    "Dillon",
  phoneNumber: "+2348000000000",
  bvn:         "95888168924",
} as const

export type BmoniSetupStatus =
  | "idle"
  | "creating_user"
  | "provisioning_wallet"
  | "starting_nigeria"
  | "fetching_vba"
  | "done"
  | "error"

export type BmoniSetupState = {
  status: BmoniSetupStatus
  error: string | null
  /** Stage 1+2: create BMONI user + provision smart wallet */
  setupWallet: () => Promise<void>
  /** Stage 3+4: start Nigeria rail + fetch VBA. Call after setupWallet completes. */
  startNigeria: (bvn: string) => Promise<void>
}

export function useBmoniSetup(
  profile: XPayProfile | null,
  onProfileUpdate: (updated: Partial<XPayProfile>) => void,
): BmoniSetupState {
  const { wallets } = useWallets()
  const embeddedWallet = wallets.find(w => w.walletClientType === "privy")

  const [status, setStatus] = useState<BmoniSetupStatus>("idle")
  const [error, setError]   = useState<string | null>(null)

  // ── Stage 1 + 2 ──────────────────────────────────────────────────────────
  const setupWallet = useCallback(async () => {
    if (!profile)          { setError("No profile found."); return }
    if (!embeddedWallet)   { setError("Embedded wallet not ready. Please try again."); return }
    if (profile.bmoni_user_id && profile.bmoni_wallet_id) return // already done

    setError(null)

    try {
      let bmoniUserId  = profile.bmoni_user_id  ?? null
      let bmoniWalletId = profile.bmoni_wallet_id ?? null

      // Stage 1: create BMONI user
      if (!bmoniUserId) {
        setStatus("creating_user")

        // SANDBOX RULES:
        //   - firstName/lastName MUST match the test persona (BVN verification checks name)
        //   - phoneNumber must be unique per BMONI user — use the XPay user's real phone
        //     so each XPay account gets its own BMONI account
        //   - email must also be unique — use the XPay user's real email
        //
        // PRODUCTION: use real user data directly
        const nameParts = profile.display_name?.trim().split(/\s+/) ?? []
        const firstName = SANDBOX ? PERSONA.firstName : (nameParts[0] || profile.username)
        const lastName  = SANDBOX ? PERSONA.lastName  : (nameParts.slice(1).join(" ") || nameParts[0] || "User")
        // Always use the real phone + email so BMONI users are unique per XPay account
        const phone = profile.phone.startsWith("+") ? profile.phone : `+${profile.phone}`
        const email = profile.email || `${profile.username}@xpay.app`

        // createBmoniUser auto-recovers on 409 by finding the existing user
        const user = await createBmoniUser({ firstName, lastName, email, phoneNumber: phone })
        bmoniUserId = user.bmoniUserId
        await updateProfile(profile.id, {
          bmoni_user_id: bmoniUserId,
          onboarding_stage: "bmoni_user",
        })
        onProfileUpdate({ bmoni_user_id: bmoniUserId, onboarding_stage: "bmoni_user" })
      }

      // Stage 2: provision smart wallet
      if (!bmoniWalletId) {
        setStatus("provisioning_wallet")
        const ownerAddress = embeddedWallet.address
        const provider     = await embeddedWallet.getEthereumProvider()
        const wallet       = await provisionSmartWallet(bmoniUserId, provider, ownerAddress, "CNGN")
        bmoniWalletId = wallet.id

        await updateProfile(profile.id, {
          bmoni_wallet_id: bmoniWalletId,
          // also persist the smart wallet's on-chain address — needed for start-nigeria
          wallet_address: wallet.address,
          bmoni_onboarding_status: "wallet_created",
          onboarding_stage: "bmoni_wallet",
        })
        onProfileUpdate({
          bmoni_wallet_id: bmoniWalletId,
          wallet_address: wallet.address,
          bmoni_onboarding_status: "wallet_created",
          onboarding_stage: "bmoni_wallet",
        })
      }

      setStatus("done")
    } catch (err) {
      setError(fmtError(err))
      setStatus("error")
    }
  }, [profile, embeddedWallet, onProfileUpdate])

  // ── Stage 3 + 4 ──────────────────────────────────────────────────────────
  const startNigeria = useCallback(async (bvn: string) => {
    if (!profile?.bmoni_user_id || !profile?.bmoni_wallet_id) {
      setError("Wallet not set up yet. Please complete setup first.")
      return
    }
    if (profile.bmoni_onboarding_status === "rail_active") return // already done

    setError(null)
    const userId        = profile.bmoni_user_id
    // ngnWalletAddress must be the SMART WALLET on-chain address, not the Privy EOA
    const walletAddress = profile.wallet_address ?? embeddedWallet?.address ?? null

    if (!walletAddress) {
      setError("Wallet address not found. Please try setting up the wallet again.")
      return
    }

    try {
      // Check if already active
      try {
        const onboarding = await getOnboardingStatus(userId)
        if (onboarding.paytrieStatus === "active") {
          await updateProfile(profile.id, {
            bmoni_onboarding_status: "rail_active",
            onboarding_stage: "complete",
          })
          onProfileUpdate({ bmoni_onboarding_status: "rail_active", onboarding_stage: "complete" })
          setStatus("done")
          return
        }
      } catch { /* not started yet — continue */ }

      // Stage 3: start Nigeria rail (BVN verifies identity — no separate /kyc/activate needed)
      setStatus("starting_nigeria")
      try {
        await startNigeriaOnboarding(userId, bvn, walletAddress, 0)
        await updateProfile(profile.id, {
          bmoni_onboarding_status: "rail_active",
          onboarding_stage: "complete",
        })
        onProfileUpdate({ bmoni_onboarding_status: "rail_active", onboarding_stage: "complete" })
      } catch (err) {
        // 400/409 = already started — treat as success and continue to VBA
        if (!(err instanceof BmoniError && (err.status === 400 || err.status === 409))) {
          throw err
        }
        await updateProfile(profile.id, { onboarding_stage: "bmoni_kyc" })
        onProfileUpdate({ onboarding_stage: "bmoni_kyc" })
      }

      // Stage 4: fetch VBA (may take a moment to provision)
      setStatus("fetching_vba")
      try {
        const vba = await getNgnDepositAccount(userId)
        if (vba.accountNumber) {
          await updateProfile(profile.id, { bmoni_ngn_vba: vba.accountNumber })
          onProfileUpdate({ bmoni_ngn_vba: vba.accountNumber })
        }
      } catch {
        // VBA may not be instantly ready — non-fatal, will be fetched later
      }

      setStatus("done")
    } catch (err) {
      setError(fmtError(err))
      setStatus("error")
    }
  }, [profile, embeddedWallet, onProfileUpdate])

  return { status, error, setupWallet, startNigeria }
}

function fmtError(err: unknown): string {
  if (err instanceof BmoniError) return `BMONI error (${err.code}): ${err.message}`
  if (err instanceof Error)      return err.message
  return "Setup failed. Please try again."
}

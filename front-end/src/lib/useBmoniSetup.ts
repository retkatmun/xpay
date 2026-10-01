/**
 * useBmoniSetup — orchestrates the BMONI NGN wallet provisioning (stages 1–2).
 *
 * Correct flow (per https://bkey.mintlify.app/api-reference/integration-flow):
 *
 *   setupWallet()  →  Stage 1: POST /v1/users           → bmoni_user_id
 *                  →  Stage 2: Provision smart wallet   → bmoni_wallet_id + wallet_address
 *
 * After setupWallet() completes the caller navigates to /kyc where the user
 * enters their BVN and address to call POST /onboarding/start-nigeria.
 *
 * ─── SANDBOX PERSONA RULES (from https://bkey.mintlify.app/api-reference/sandbox-test-data) ──
 * BMONI sandbox verification checks BOTH the identity number AND the name/phone
 * submitted alongside it. Using your own name with a test BVN will fail.
 *
 * The user MUST be created with the persona's exact details:
 *   Persona 1 → firstName:"Bunch"   lastName:"Dillon"  phone:"+2348000000000"  BVN: 95888168924
 *   Persona 2 → firstName:"Samson"  lastName:"Jabo"    phone:"+2348000000001"  BVN: 22222222222
 *
 * IMPORTANT: We always use Persona 1 (Bunch Dillon / BVN 95888168924) in sandbox.
 * BVN 22222222222 (Samson Jabo) exists but requires a separately created Samson Jabo user.
 * Since we only create Bunch Dillon accounts, 95888168924 is the only correct BVN to use.
 * The real user's email is still used as the unique account identifier.
 *
 * In production (VITE_BMONI_BASE_URL points to embedded.bmoni.com) the user's
 * real name and real phone are used and real BVNs are accepted.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback } from "react"
import { useWallets } from "@privy-io/react-auth"
import {
  createBmoniUser,
  provisionSmartWallet,
  BmoniError,
} from "@/lib/bmoni"
import { updateProfile } from "@/lib/supabase"
import type { XPayProfile } from "@/lib/session"

// ── Determine environment ─────────────────────────────────────────────────────
const IS_SANDBOX =
  import.meta.env.DEV ||
  (import.meta.env.VITE_BMONI_BASE_URL as string | undefined)?.includes("-dev") ||
  false

// Sandbox persona 1 — Bunch Dillon (BVN 95888168924)
// CRITICAL: phone must be the persona phone, not the real user's phone.
// BMONI matches firstName + lastName + phoneNumber against the persona record.
// Since we always create Bunch Dillon accounts, BVN 95888168924 is the only
// correct sandbox BVN to use at the KYC step.
const SANDBOX_FIRST_NAME = "Bunch"
const SANDBOX_LAST_NAME  = "Dillon"
const SANDBOX_PHONE      = "+2348000000000"  // Bunch Dillon's persona phone (E.164)

// ── Types ─────────────────────────────────────────────────────────────────────

export type BmoniSetupStatus =
  | "idle"
  | "creating_user"
  | "provisioning_wallet"
  | "done"
  | "error"

export type BmoniSetupState = {
  status: BmoniSetupStatus
  error: string | null
  setupWallet: () => Promise<void>
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBmoniSetup(
  profile: XPayProfile | null,
  onProfileUpdate: (updated: Partial<XPayProfile>) => void,
): BmoniSetupState {
  const { wallets } = useWallets()
  const embeddedWallet = wallets.find(w => w.walletClientType === "privy")

  const [status, setStatus] = useState<BmoniSetupStatus>("idle")
  const [error, setError]   = useState<string | null>(null)

  const setupWallet = useCallback(async () => {
    if (!profile) {
      setError("No profile found.")
      return
    }
    if (!embeddedWallet) {
      setError("Embedded wallet not ready. Please try again in a moment.")
      return
    }
    // Already fully provisioned — nothing to do
    if (profile.bmoni_user_id && profile.bmoni_wallet_id) return

    setError(null)

    try {
      let bmoniUserId   = profile.bmoni_user_id   ?? null
      let bmoniWalletId = profile.bmoni_wallet_id ?? null

      // ── Stage 1: Create BMONI user ────────────────────────────────────────
      if (!bmoniUserId) {
        setStatus("creating_user")

        // In sandbox use the fixed persona name AND phone so BMONI verification
        // succeeds. The persona's phone is what BMONI matches against — using the
        // real user's Nigerian phone number causes a name/phone mismatch failure.
        // The real email is still used as the unique identifier per user.
        // In production use the real user's name and phone.
        const nameParts = profile.display_name?.trim().split(/\s+/) ?? []
        const firstName = IS_SANDBOX
          ? SANDBOX_FIRST_NAME
          : (nameParts[0] || profile.username)
        const lastName = IS_SANDBOX
          ? SANDBOX_LAST_NAME
          : (nameParts.slice(1).join(" ") || nameParts[0] || "User")

        // Sandbox: always use persona phone. Production: use real phone in E.164.
        const phone = IS_SANDBOX
          ? SANDBOX_PHONE
          : (profile.phone.startsWith("+") ? profile.phone : `+${profile.phone}`)
        const email = profile.email || `${profile.username}@xpay.app`

        const user = await createBmoniUser({ firstName, lastName, email, phoneNumber: phone })
        bmoniUserId = user.bmoniUserId

        await updateProfile(profile.id, {
          bmoni_user_id: bmoniUserId,
          onboarding_stage: "bmoni_user",
        })
        onProfileUpdate({ bmoni_user_id: bmoniUserId, onboarding_stage: "bmoni_user" })
      }

      // ── Stage 2: Provision smart wallet ──────────────────────────────────
      if (!bmoniWalletId) {
        setStatus("provisioning_wallet")

        const ownerAddress = embeddedWallet.address
        const provider     = await embeddedWallet.getEthereumProvider()
        const wallet       = await provisionSmartWallet(bmoniUserId, provider, ownerAddress, "CNGN")
        bmoniWalletId = wallet.id

        await updateProfile(profile.id, {
          bmoni_wallet_id: bmoniWalletId,
          wallet_address: wallet.address,   // smart wallet on-chain address for start-nigeria
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

  return { status, error, setupWallet }
}

function fmtError(err: unknown): string {
  if (err instanceof BmoniError) return `BMONI error (${err.code}): ${err.message}`
  if (err instanceof Error)      return err.message
  return "Setup failed. Please try again."
}

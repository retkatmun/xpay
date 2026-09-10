/**
 * Onboarding draft.
 *
 * Held in sessionStorage rather than React state so a refresh mid-signup doesn't
 * drop someone back to the start. Cleared as soon as the account is created.
 *
 * The PIN is held here only for the single navigation step from /pin → /username.
 * It is posted straight to the backend, hashed with Argon2id server-side, and
 * never stored in plaintext beyond this transient sessionStorage slot.
 * clearDraft() is called immediately after createAccount() succeeds.
 */

const KEY = "xpay.onboarding";

export type Draft = {
  phone?: string;
  verified?: boolean;
  signupToken?: string;
  pin?: string;
  displayName?: string;
  username?: string;
  /** Dev-only: OTP code returned from the backend in non-production environments. */
  devCode?: string;
  /**
   * "signup" — new user going through full onboarding.
   * "login"  — existing user verifying phone after Privy auth, will enter PIN next.
   */
  intent?: "signup" | "login";
};

export function getDraft(): Draft {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Draft) : {};
  } catch {
    return {};
  }
}

export function patchDraft(patch: Draft): Draft {
  const next = { ...getDraft(), ...patch };
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(KEY);
}

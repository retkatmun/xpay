/**
 * hasAccount — tracks whether this browser has ever completed XPay onboarding.
 *
 * The flag is set once (on first successful login/onboarding) and is NEVER
 * cleared on sign-out. Its sole purpose is to let the landing page navbar
 * know whether to show "Sign In" (new visitor) or only "Get Started" (returning
 * user who already knows the product).
 *
 * When the flag is present and the user clicks "Get Started" on the landing page,
 * they are routed to /login — not the signup flow — so they can log back in.
 */

export const HAS_ACCOUNT_KEY = "xpay_has_account";

export function markHasAccount(): void {
  try { localStorage.setItem(HAS_ACCOUNT_KEY, "true"); } catch { /* SSR / private mode */ }
}

export function readHasAccount(): boolean {
  try { return localStorage.getItem(HAS_ACCOUNT_KEY) === "true"; } catch { return false; }
}

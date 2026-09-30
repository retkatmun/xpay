import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { fetchProfileById, updateProfile, supabaseSignOut } from "@/lib/supabase";
import { markHasAccount } from "@/lib/hasAccount";

export type XPayProfile = {
  id: string;
  email: string | null;
  phone: string;
  username: string;
  display_name: string;
  wallet_address?: string | null;
  pin_hash?: string | null;
  role: "user" | "admin";
  account_number?: string | null;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

type SessionValue = {
  /** Privy user ID (string) — used as the profile primary key */
  authUser: { id: string; email?: string } | null;
  profile: XPayProfile | null;
  /**
   * True only while we need to block a redirect decision:
   * - Privy SDK not yet ready, OR
   * - User is authenticated but profile fetch is still in flight.
   * Use this to gate `navigate("/home")` style redirects.
   */
  loading: boolean;
  /**
   * True while Privy SDK is initialising (before `ready`).
   * Use this to disable the login button / show a skeleton.
   * Becomes false as soon as Privy is ready — before the profile loads.
   */
  privyLoading: boolean;
  isAdmin: boolean;
  walletAddress: string | null;
  setProfile: (p: XPayProfile | null) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user: privyUser, logout } = usePrivy();
  const { wallets } = useWallets();

  const [profile, setProfile] = useState<XPayProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  // Safety valve: if Privy never fires `ready`, unblock the button after 4s
  const [privyTimedOut, setPrivyTimedOut] = useState(false);

  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setPrivyTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [ready]);

  const authUser = useMemo(() => {
    if (!authenticated || !privyUser) return null;
    return {
      id: privyUser.id,
      email:
        privyUser.email?.address ??
        (privyUser.google as { email?: string } | null)?.email ??
        undefined,
    };
  }, [authenticated, privyUser]);

  // Get embedded wallet address from Privy
  const embeddedWallet = wallets.find(w => w.walletClientType === "privy");
  const walletAddress = embeddedWallet?.address ?? null;

  const refresh = useCallback(async () => {
    if (!authUser) {
      setProfile(null);
      return;
    }
    try {
      const p = await fetchProfileById(authUser.id);
      setProfile(p as XPayProfile | null);
    } catch (error) {
      console.error("Failed to fetch profile:", error);
      setProfile(null);
    }
  }, [authUser]);

  // Load profile whenever Privy auth state changes
  useEffect(() => {
    if (!ready) return;
    if (!authenticated || !privyUser) {
      setProfile(null);
      setProfileLoaded(true);
      return;
    }

    const timer = setTimeout(() => setProfileLoaded(true), 3000);

    fetchProfileById(privyUser.id)
      .then((p) => {
        setProfile(p as XPayProfile | null);
        setProfileLoaded(true);
        // Mark that this browser has had an account — used by the landing page
        // to hide "Sign In" for returning users (they still reach login via "Get Started")
        if (p) markHasAccount();
      })
      .catch(() => {
        setProfile(null);
        setProfileLoaded(true);
      })
      .finally(() => clearTimeout(timer));
  }, [ready, authenticated, privyUser?.id]);

  // ── Auto-sync wallet address to profile ──────────────────────────────────
  // Privy creates the embedded wallet after login — it may not exist yet when
  // createProfile runs during onboarding. Whenever we have both a profile and
  // a walletAddress from Privy but the profile row has no wallet_address,
  // silently patch it in Supabase so other users can find and pay this user.
  useEffect(() => {
    if (!profile || !walletAddress) return;
    if (profile.wallet_address === walletAddress) return; // already in sync

    updateProfile(profile.id, { wallet_address: walletAddress })
      .then(() => {
        setProfile(prev => prev ? { ...prev, wallet_address: walletAddress } : prev);
        console.info("[session] wallet address synced to profile:", walletAddress);
      })
      .catch((err) => {
        // Non-fatal — log and continue
        console.warn("[session] failed to sync wallet address:", err);
      });
  }, [profile?.id, walletAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = useCallback(async () => {
    await logout();
    try { await supabaseSignOut(); } catch { /* ignore */ }
    setProfile(null);
    setProfileLoaded(false);
  }, [logout]);

  const loading = !ready || (authenticated && !profileLoaded);
  const privyLoading = !ready && !privyTimedOut;
  const isAdmin = profile?.role === "admin";

  const value = useMemo(
    () => ({ authUser, profile, loading, privyLoading, isAdmin, walletAddress, setProfile, refresh, signOut }),
    [authUser, profile, loading, privyLoading, isAdmin, walletAddress, refresh, signOut]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

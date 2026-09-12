import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { fetchProfileById, supabaseSignOut } from "@/lib/supabase";

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
  loading: boolean;
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

  // Get embedded wallet address
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || null;

  const refresh = useCallback(async () => {
    if (!authUser) { 
      setProfile(null); 
      return; 
    }
    try {
      const p = await fetchProfileById(authUser.id);
      setProfile(p as XPayProfile | null);
    } catch (error) {
      console.error('Failed to fetch profile:', error);
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

    // Timeout after 8s so we never hang forever on a slow Supabase response
    const timer = setTimeout(() => setProfileLoaded(true), 8000);

    fetchProfileById(privyUser.id)
      .then((p) => {
        setProfile(p as XPayProfile | null);
        setProfileLoaded(true);
      })
      .catch((error) => {
        console.error('Error loading profile:', error);
        setProfile(null);
        setProfileLoaded(true);
      })
      .finally(() => clearTimeout(timer));
  }, [ready, authenticated, privyUser?.id]);

  const signOut = useCallback(async () => {
    await logout();
    try { await supabaseSignOut(); } catch { /* ignore */ }
    setProfile(null);
    setProfileLoaded(false);
  }, [logout]);

  // Only block on Privy not being ready OR on the first profile fetch.
  // Once profileLoaded is true we never show a loading state again.
  const loading = !ready || (authenticated && !profileLoaded);
  const isAdmin = profile?.role === "admin";

  const value = useMemo(
    () => ({ authUser, profile, loading, isAdmin, walletAddress, setProfile, refresh, signOut }),
    [authUser, profile, loading, isAdmin, walletAddress, refresh, signOut]
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

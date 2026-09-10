import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
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
  created_at?: string;
  updated_at?: string;
};

type SessionValue = {
  /** Privy user ID (string) — used as the profile primary key */
  authUser: { id: string; email?: string } | null;
  profile: XPayProfile | null;
  loading: boolean;
  isAdmin: boolean;
  setProfile: (p: XPayProfile | null) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user: privyUser, logout } = usePrivy();

  const [profile, setProfile] = useState<XPayProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
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

  const refresh = useCallback(async () => {
    if (!authUser) { setProfile(null); return; }
    const p = await fetchProfileById(authUser.id);
    setProfile(p as XPayProfile | null);
  }, [authUser]);

  // Load profile whenever Privy auth state changes
  useEffect(() => {
    if (!ready) return;
    if (!authenticated || !privyUser) {
      setProfile(null);
      setProfileLoaded(true);
      return;
    }
    setProfileLoading(true);
    fetchProfileById(privyUser.id)
      .then((p) => {
        setProfile(p as XPayProfile | null);
        setProfileLoaded(true);
        setProfileLoading(false);
      })
      .catch(() => {
        setProfile(null);
        setProfileLoaded(true);
        setProfileLoading(false);
      });
  }, [ready, authenticated, privyUser?.id]);

  const signOut = useCallback(async () => {
    await logout();
    try { await supabaseSignOut(); } catch { /* ignore */ }
    setProfile(null);
  }, [logout]);

  const loading = !ready || (authenticated && profileLoading && !profileLoaded);
  const isAdmin = profile?.role === "admin";

  const value = useMemo(
    () => ({ authUser, profile, loading, isAdmin, setProfile, refresh, signOut }),
    [authUser, profile, loading, isAdmin, refresh, signOut]
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

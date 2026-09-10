import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
// Service role client — bypasses RLS for profile operations
// (Privy handles auth; Supabase is used only for profile storage)
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
// Admin client bypasses RLS — used for all profile CRUD since Privy IDs aren't Supabase auth users
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/** Sign out (no-op since we use Privy auth, not Supabase auth) */
export async function supabaseSignOut() {
  // Supabase has no active session here since we use Privy for auth
  // This is intentionally a no-op — Privy logout handles the session
}

/** Returns true if the @username is already taken */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  return !!data;
}

/** Fetch a profile by Privy user ID */
export async function fetchProfileById(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

/** Insert a new XPay profile row (uses service role to bypass RLS) */
export async function createProfile(profile: {
  id: string;
  email: string | null;
  phone: string;
  username: string;
  display_name: string;
  pin_hash?: string | null;
  wallet_address?: string | null;
}) {
  // Check username uniqueness before insert (gives a friendly error)
  const taken = await isUsernameTaken(profile.username);
  if (taken) throw new Error("That username is already taken. Please choose a different one.");

  // Check if a profile already exists for this Privy user
  const existing = await fetchProfileById(profile.id);
  if (existing) {
    // Profile already exists, just return it
    return existing;
  }

  // Determine role: admin if email matches VITE_ADMIN_EMAIL
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;
  const role =
    adminEmail && profile.email && profile.email.toLowerCase() === adminEmail.toLowerCase()
      ? "admin"
      : "user";

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .insert({ ...profile, role })
    .select()
    .single();

  if (error) {
    // Postgres unique violation on username
    if (error.code === "23505" && error.message.includes("username")) {
      throw new Error("That username is already taken. Please choose a different one.");
    }
    throw new Error(error.message || "Failed to create profile. Please try again.");
  }
  return data;
}

/** Fetch all profiles (admin only) */
export async function fetchAllProfiles() {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Update a user's role (admin only) */
export async function updateUserRole(userId: string, role: "user" | "admin") {
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

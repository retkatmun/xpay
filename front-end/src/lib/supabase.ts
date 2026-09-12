import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
// Service role client — bypasses RLS for all profile CRUD
// (Privy handles auth; Supabase is used only for profile storage)
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Derive a 10-digit account number from an E.164 phone number by stripping
 * the country code and taking the last 10 digits.
 *
 * e.g. "+2347071663687" → "7071663687"
 *      "+12125551234"   → "2125551234"
 *
 * Works for any country code length (1–4 digits) because we always take the
 * last 10 digits of the digit-only string.
 */
export function phoneToAccountNumber(phone: string): string {
  const digits = phone.replace(/\D/g, ""); // strip everything except digits
  return digits.slice(-10);               // last 10 = local number
}

/** No-op — we use Privy for auth, not Supabase auth sessions */
export async function supabaseSignOut() {
  // intentionally empty
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

/**
 * Search profiles by username prefix OR display name OR phone/account_number.
 * Returns up to 10 matches with wallet_address included.
 */
export async function searchProfiles(query: string): Promise<{
  username: string
  display_name: string
  wallet_address: string | null
  phone: string
  account_number: string | null
  avatar_url: string | null
}[]> {
  // Strip @prefix and .xpay suffix, lowercase
  const q = query.trim().toLowerCase().replace(/^@/, "").replace(/\.xpay$/i, "").trim()
  if (!q || q.length < 2) return []

  const isNumeric = /^\d+$/.test(q)

  let dbQuery = supabaseAdmin
    .from("profiles")
    .select("username, display_name, wallet_address, phone, account_number, avatar_url")
    .limit(10)

  if (isNumeric) {
    // Search by phone or account number
    dbQuery = dbQuery.or(`account_number.ilike.%${q}%,phone.ilike.%${q}%`)
  } else {
    // Search by username prefix OR display name (contains)
    dbQuery = dbQuery.or(`username.ilike.${q}%,display_name.ilike.%${q}%,username.eq.${q}`)
  }

  const { data, error } = await dbQuery
  if (error) {
    console.error("[searchProfiles] error:", error)
    return []
  }
  return (data ?? []) as {
    username: string
    display_name: string
    wallet_address: string | null
    phone: string
    account_number: string | null
    avatar_url: string | null
  }[]
}

/**
 * Insert a new XPay profile row.
 * All new users get role = 'user' by default.
 * Role can only be changed from the Admin Panel inside the app.
 * account_number is automatically derived from the phone number.
 */
export async function createProfile(profile: {
  id: string;
  email: string | null;
  phone: string;
  username: string;
  display_name: string;
  pin_hash?: string | null;
  wallet_address?: string | null;
}) {
  // Check username uniqueness first for a friendly error
  const taken = await isUsernameTaken(profile.username);
  if (taken) {
    throw new Error("That username is already taken. Please choose a different one.");
  }

  // If profile already exists for this Privy user, return it (idempotent)
  const existing = await fetchProfileById(profile.id);
  if (existing) return existing;

  // Derive the 10-digit account number from the phone number
  const account_number = phoneToAccountNumber(profile.phone);

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .insert({ ...profile, role: "user", account_number })
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

/** Fetch all profiles — admin panel only */
export async function fetchAllProfiles() {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Fetch ALL transactions across all users — admin panel only */
export async function fetchAllTransactions(): Promise<SupabaseTransaction[]> {
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []) as SupabaseTransaction[]
}

/** Aggregate platform stats — admin panel only */
export async function fetchAdminStats(): Promise<{
  totalTx: number
  completedTx: number
  pendingTx: number
  failedTx: number
  totalVolumeUsdc: bigint
  totalVolumeNgn: bigint
  totalFeesNgn: bigint
  totalUsers: number
}> {
  const [txResult, profileResult] = await Promise.all([
    supabaseAdmin.from("transactions").select("status, amount, ngn_amount, fee_ngn, direction"),
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
  ])
  if (txResult.error) throw new Error(txResult.error.message)

  const txs = (txResult.data ?? []) as {
    status: string; amount: string; ngn_amount: string; fee_ngn: string; direction: string
  }[]

  let totalVolumeUsdc = 0n, totalVolumeNgn = 0n, totalFeesNgn = 0n
  let completedTx = 0, pendingTx = 0, failedTx = 0

  const TERMINAL_OK   = ["completed"]
  const TERMINAL_FAIL = ["blockchain_failed","payout_failed","cancelled","expired","rejected"]

  for (const tx of txs) {
    if (tx.direction === "out") {
      totalVolumeUsdc += BigInt(tx.amount    || "0")
      totalVolumeNgn  += BigInt(tx.ngn_amount|| "0")
      totalFeesNgn    += BigInt(tx.fee_ngn   || "0")
    }
    if      (TERMINAL_OK.includes(tx.status))   completedTx++
    else if (TERMINAL_FAIL.includes(tx.status)) failedTx++
    else                                         pendingTx++
  }

  return {
    totalTx: txs.length, completedTx, pendingTx, failedTx,
    totalVolumeUsdc, totalVolumeNgn, totalFeesNgn,
    totalUsers: profileResult.count ?? 0,
  }
}

/** Update a user's role — admin panel only */
export async function updateUserRole(userId: string, role: "user" | "admin") {
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

/** Update a profile — used to sync wallet address and other data */
export async function updateProfile(userId: string, updates: {
  wallet_address?: string | null;
  display_name?: string;
  email?: string | null;
  [key: string]: any;
}) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select()
    .single();

  if (error) throw new Error(error.message || "Failed to update profile");
  return data;
}

// ─── Avatar / profile picture storage ────────────────────────────────────────

const AVATAR_BUCKET = "avatars"

/**
 * Upload a profile picture for a user.
 * File is stored at avatars/{userId}.{ext} — overwrites any previous upload.
 * Returns the public URL.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext  = file.name.split(".").pop()?.toLowerCase() ?? "jpg"
  const path = `${userId}.${ext}`

  // upsert: overwrite existing file without error
  const { error } = await supabaseAdmin.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (error) throw new Error(error.message)

  const { data } = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  // Bust cache with a timestamp so the browser re-fetches
  return `${data.publicUrl}?t=${Date.now()}`
}

/** Delete a user's avatar from storage. */
export async function deleteAvatar(userId: string): Promise<void> {
  // Try both common extensions
  const paths = ["jpg","jpeg","png","webp","gif"].map(e => `${userId}.${e}`)
  await supabaseAdmin.storage.from(AVATAR_BUCKET).remove(paths)
}

/** Derive the public URL for a user's avatar (no existence check). */
export function getAvatarUrl(userId: string, ext = "jpg"): string {
  const { data } = supabaseAdmin.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(`${userId}.${ext}`)
  return data.publicUrl
}

export type SupabaseTransaction = {
  id: string
  user_id: string
  direction: "in" | "out"
  recipient_type: "xpay_user" | "bank_account"
  recipient_display_name: string
  recipient_bank_name: string | null
  recipient_account_number_last4: string | null
  asset: string
  amount: string
  chain_id: number | null
  tx_hash: string | null
  status: string
  fee_ngn: string
  fx_rate: number
  ngn_amount: string
  memo: string | null
  created_at: string
  updated_at: string
}

/** Fetch all transactions for a user, newest first */
export async function fetchTransactions(userId: string): Promise<SupabaseTransaction[]> {
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as SupabaseTransaction[]
}

/** Fetch a single transaction by ID */
export async function fetchTransaction(id: string): Promise<SupabaseTransaction | null> {
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as SupabaseTransaction | null
}

/** Insert a new transaction record */
export async function insertTransaction(
  tx: Omit<SupabaseTransaction, "id" | "created_at" | "updated_at">
): Promise<SupabaseTransaction> {
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .insert(tx)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as SupabaseTransaction
}

/** Update transaction status */
export async function updateTransactionStatus(id: string, status: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("transactions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

export type SavedBeneficiary = {
  id: string;
  user_id: string;
  type: "bank_account" | "xpay_user";
  label: string;
  bank_name?: string | null;
  bank_code?: string | null;
  account_number?: string | null;
  account_name?: string | null;
  xpay_username?: string | null;
  phone?: string | null;
  created_at: string;
};

export async function getSavedBeneficiaries(userId: string): Promise<SavedBeneficiary[]> {
  const { data, error } = await supabaseAdmin
    .from("saved_beneficiaries")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedBeneficiary[];
}

export async function saveBeneficiary(
  userId: string,
  beneficiary: Omit<SavedBeneficiary, "id" | "user_id" | "created_at">
): Promise<SavedBeneficiary> {
  const { data, error } = await supabaseAdmin
    .from("saved_beneficiaries")
    .insert({ ...beneficiary, user_id: userId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SavedBeneficiary;
}

export async function deleteBeneficiary(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("saved_beneficiaries")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

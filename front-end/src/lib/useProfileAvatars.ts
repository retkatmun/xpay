/**
 * useProfileAvatars
 *
 * Given a list of XPay usernames, returns a Map<username, avatar_url | null>
 * that populates asynchronously. Results are cached in a module-level Map so
 * multiple components sharing the same usernames don't trigger duplicate fetches.
 *
 * Usage:
 *   const avatars = useProfileAvatars(["alice", "bob"])
 *   <Avatar src={avatars.get("alice")} name="Alice" />
 */

import { useEffect, useState } from "react"
import { supabaseAdmin } from "@/lib/supabase"

// Module-level cache: username → avatar_url (null = no avatar, undefined = not fetched yet)
const cache = new Map<string, string | null>()

// In-flight fetch promises so concurrent calls don't create duplicate requests
const inflight = new Map<string, Promise<string | null>>()

/**
 * Batch-fetches up to 20 usernames in a single Supabase query, then populates
 * the module-level cache and resolves individual promises.
 */
async function batchFetch(usernames: string[]): Promise<void> {
  const missing = usernames.filter(u => !cache.has(u) && !inflight.has(u))
  if (missing.length === 0) return

  // Mark all as in-flight immediately to block duplicate calls
  const resolvers = new Map<string, (v: string | null) => void>()
  for (const u of missing) {
    const p = new Promise<string | null>(resolve => resolvers.set(u, resolve))
    inflight.set(u, p)
  }

  try {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("username, avatar_url")
      .in("username", missing)

    const byUsername = new Map<string, string | null>()
    for (const row of (data ?? []) as { username: string; avatar_url: string | null }[]) {
      byUsername.set(row.username, row.avatar_url ?? null)
    }

    for (const u of missing) {
      const url = byUsername.get(u) ?? null
      cache.set(u, url)
      resolvers.get(u)?.(url)
      inflight.delete(u)
    }
  } catch {
    // On error, resolve everyone with null and clear inflight
    for (const u of missing) {
      cache.set(u, null)
      resolvers.get(u)?.(null)
      inflight.delete(u)
    }
  }
}

/**
 * Hook. Re-renders once when the batch fetch resolves.
 *
 * @param usernames - list of XPay usernames (no "@" prefix)
 * @returns Map<username, avatar_url | null>
 */
export function useProfileAvatars(usernames: string[]): Map<string, string | null> {
  // Start from whatever is already cached
  const [avatars, setAvatars] = useState<Map<string, string | null>>(() => {
    const m = new Map<string, string | null>()
    for (const u of usernames) {
      if (cache.has(u)) m.set(u, cache.get(u)!)
    }
    return m
  })

  useEffect(() => {
    if (usernames.length === 0) return

    // Filter to usernames that look valid (non-empty, no spaces) and deduplicate
    const valid = [...new Set(usernames.filter(u => u && !/\s/.test(u)))]
    if (valid.length === 0) return

    // If all already cached, just sync state without network call
    const allCached = valid.every(u => cache.has(u))
    if (allCached) {
      setAvatars(prev => {
        const next = new Map(prev)
        let changed = false
        for (const u of valid) {
          const cached = cache.get(u)!
          if (next.get(u) !== cached) { next.set(u, cached); changed = true }
        }
        return changed ? next : prev
      })
      return
    }

    // Batch-fetch missing ones then update state
    batchFetch(valid).then(() => {
      setAvatars(() => {
        const m = new Map<string, string | null>()
        for (const u of valid) m.set(u, cache.get(u) ?? null)
        return m
      })
    })
  }, [usernames.join(",")]) // eslint-disable-line react-hooks/exhaustive-deps

  return avatars
}

/**
 * Imperatively invalidate a cached avatar (call after upload so the next
 * render picks up the fresh URL).
 */
export function invalidateAvatarCache(username: string): void {
  cache.delete(username)
  inflight.delete(username)
}

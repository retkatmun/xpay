import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession, type XPayProfile } from "@/lib/session";
import { fetchAllProfiles, updateUserRole } from "@/lib/supabase";
import { Screen } from "@/components/Screen";
import { Title } from "@/components/Screen";
import { Spinner } from "@/components/icons";
import { Avatar } from "@/components/Avatar";

type SortKey = "created_at" | "username" | "display_name" | "role";

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        role === "admin"
          ? "bg-purple-100 text-purple-700"
          : "bg-gray-100 text-gray-600",
      ].join(" ")}
    >
      {role === "admin" && (
        <svg viewBox="0 0 12 12" width="9" height="9" fill="currentColor">
          <path d="M6 0l1.5 3.5L11 4 8.5 6.5 9 10l-3-1.5L3 10l.5-3.5L1 4l3.5-.5z" />
        </svg>
      )}
      {role}
    </span>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const { authUser, profile, loading, isAdmin } = useSession();

  const [users, setUsers] = useState<XPayProfile[]>([]);
  const [fetching, setFetching] = useState(true);
  const [sort, setSort] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guard: redirect non-admins
  useEffect(() => {
    if (loading) return;
    if (!authUser) { navigate("/login", { replace: true }); return; }
    if (!profile) { navigate("/onboarding", { replace: true }); return; }
    if (!isAdmin) { navigate("/home", { replace: true }); return; }
  }, [loading, authUser, profile, isAdmin, navigate]);

  // Fetch all users
  useEffect(() => {
    if (!isAdmin) return;
    setFetching(true);
    fetchAllProfiles()
      .then((data) => setUsers(data as XPayProfile[]))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load users."))
      .finally(() => setFetching(false));
  }, [isAdmin]);

  async function toggleRole(user: XPayProfile) {
    const newRole = user.role === "admin" ? "user" : "admin";
    setUpdating(user.id);
    setError(null);
    try {
      await updateUserRole(user.id, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u))
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update role.");
    } finally {
      setUpdating(null);
    }
  }

  function handleSort(key: SortKey) {
    if (sort === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(key); setSortDir("asc"); }
  }

  if (loading || !isAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.display_name.toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q) ||
      u.phone.includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = (a[sort] as string) ?? "";
    const bv = (b[sort] as string) ?? "";
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const admins = users.filter((u) => u.role === "admin").length;

  function SortIcon({ col }: { col: SortKey }) {
    if (sort !== col) return <span className="ml-1 text-gray-300">↕</span>;
    return <span className="ml-1 text-blue-600">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <Screen back onBack={() => navigate("/home")}>
      <div className="flex flex-1 flex-col pt-4 pb-12">
        <Title sub="Manage users and roles for the XPay platform.">
          Admin Panel
        </Title>

        {/* Stats row */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "Total Users", value: users.length },
            { label: "Admins", value: admins },
            { label: "Regular", value: users.length - admins },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-gray-100 bg-white px-3 py-3 text-center shadow-sm"
            >
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="mt-4">
          <div className="flex h-10 items-center gap-2 rounded-xl border-2 border-gray-200 bg-white px-3 ring-2 ring-transparent transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
              <circle cx="6.5" cy="6.5" r="4" />
              <path d="M11 11l3 3" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, @handle, email or phone…"
              className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
                <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M2 2l8 8M10 2l-8 8" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Table */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
            <button
              onClick={() => handleSort("display_name")}
              className="text-left text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-700"
            >
              User <SortIcon col="display_name" />
            </button>
            <button
              onClick={() => handleSort("role")}
              className="text-left text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-700"
            >
              Role <SortIcon col="role" />
            </button>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Action
            </span>
          </div>

          {fetching && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
              <Spinner className="h-5 w-5 text-blue-500" />
              Loading users…
            </div>
          )}

          {!fetching && sorted.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">
              {search ? "No users match your search." : "No users found."}
            </div>
          )}

          {!fetching &&
            sorted.map((user, i) => {
              const isSelf = user.id === authUser?.id;
              return (
                <div
                  key={user.id}
                  className={[
                    "grid grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-3",
                    i < sorted.length - 1 ? "border-b border-gray-50" : "",
                    isSelf ? "bg-blue-50/40" : "hover:bg-gray-50",
                  ].join(" ")}
                >
                  {/* User info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={user.display_name} size={36} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {user.display_name}
                        </p>
                        {isSelf && (
                          <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-blue-600">
                            You
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-gray-400">
                        @{user.username}
                        {user.email ? ` · ${user.email}` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Role badge */}
                  <RoleBadge role={user.role} />

                  {/* Toggle action */}
                  <button
                    onClick={() => !isSelf && toggleRole(user)}
                    disabled={isSelf || updating === user.id}
                    className={[
                      "flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition",
                      isSelf
                        ? "cursor-not-allowed text-gray-300"
                        : user.role === "admin"
                        ? "bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600"
                        : "bg-purple-50 text-purple-700 hover:bg-purple-100",
                    ].join(" ")}
                    title={isSelf ? "You cannot change your own role" : `Make ${user.role === "admin" ? "regular user" : "admin"}`}
                  >
                    {updating === user.id ? (
                      <Spinner className="h-3.5 w-3.5" />
                    ) : user.role === "admin" ? (
                      "Revoke"
                    ) : (
                      "Make Admin"
                    )}
                  </button>
                </div>
              );
            })}
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          {sorted.length} of {users.length} user{users.length !== 1 ? "s" : ""} shown
        </p>
      </div>
    </Screen>
  );
}

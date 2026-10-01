/**
 * User Dashboard — shows enrollment status, payment status, progress,
 * and account info for the authenticated user.
 */

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useSession } from "@/lib/session"
import { AppShell } from "@/components/AppShell"
import { fetchEnrollmentsByUser, type Enrollment } from "@/lib/supabase"
import { Spinner } from "@/components/icons"

// ── Status colours ────────────────────────────────────────────────────────────

const ENROLL_BADGE: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-700",
  active:    "bg-green-100 text-emerald-400",
  suspended: "bg-orange-100 text-orange-700",
  completed: "bg-emerald-500/20 text-emerald-400",
  cancelled: "bg-red-100 text-red-600",
}

const PAY_BADGE: Record<string, string> = {
  pending:  "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-emerald-400",
  rejected: "bg-red-100 text-red-400",
  refunded: "bg-purple-100 text-purple-700",
  failed:   "bg-red-100 text-red-600",
}

const ENROLL_LABEL: Record<string, string> = {
  pending:   "Pending activation",
  active:    "Active",
  suspended: "Suspended",
  completed: "Completed",
  cancelled: "Cancelled",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EnrollmentCard({ enrollment }: { enrollment: Enrollment }) {
  const latestPay = enrollment.payments?.[0] ?? null
  const progress  = enrollment.progress ?? null
  const pct = progress && progress.total_lessons > 0
    ? Math.round((progress.completed_lessons / progress.total_lessons) * 100) : 0

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-white/[0.06] px-5 py-4">
        <div>
          <p className="font-bold text-white/90">{enrollment.course_name}</p>
          <p className="mt-0.5 text-xs capitalize text-white/50">{enrollment.program_type} programme</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${ENROLL_BADGE[enrollment.status] ?? "bg-white/[0.07] text-white/50"}`}>
          {ENROLL_LABEL[enrollment.status] ?? enrollment.status}
        </span>
      </div>

      <div className="space-y-4 px-5 py-4">
        {/* Dates */}
        <div className="flex gap-6 text-xs text-white/50">
          <div>
            <p className="font-semibold text-white/40 uppercase tracking-wide text-[10px]">Enrolled</p>
            <p className="mt-0.5 text-white/70">{fmtDate(enrollment.enrolled_at)}</p>
          </div>
          {enrollment.activated_at && (
            <div>
              <p className="font-semibold text-white/40 uppercase tracking-wide text-[10px]">Activated</p>
              <p className="mt-0.5 text-white/70">{fmtDate(enrollment.activated_at)}</p>
            </div>
          )}
        </div>

        {/* Progress bar (only shown when active + progress exists) */}
        {enrollment.status === "active" && progress && progress.total_lessons > 0 && (
          <div>
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="font-semibold text-white/70">Progress</span>
              <span className="tabular-nums text-white/50">{progress.completed_lessons}/{progress.total_lessons} lessons</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
              <div className="h-full rounded-full bg-emerald-500/100 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-right text-xs font-semibold text-emerald-400">{pct}%</p>
          </div>
        )}

        {enrollment.status === "active" && (!progress || progress.total_lessons === 0) && (
          <div className="rounded-xl bg-emerald-950/30 px-4 py-3 text-xs text-emerald-400">
            ✓ Your enrollment is active. Progress tracking will appear once lessons are assigned.
          </div>
        )}

        {enrollment.status === "pending" && (
          <div className="rounded-xl border border-amber-900/30 bg-amber-950/30 px-4 py-3 text-xs text-amber-400">
            Your enrollment is awaiting admin review. You will be notified once activated.
          </div>
        )}

        {/* Payment section */}
        {latestPay ? (
          <div className="rounded-xl border border-white/[0.06] bg-[#161618] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-white/60">Payment</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PAY_BADGE[latestPay.status] ?? "bg-white/[0.07]"}`}>
                {latestPay.status}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold tabular-nums text-white/90">₦{Number(latestPay.amount).toLocaleString()}</span>
              <span className="text-xs text-white/40">{latestPay.currency}</span>
            </div>
            {latestPay.payment_method && (
              <p className="text-xs text-white/50 capitalize">via {latestPay.payment_method.replace(/_/g, " ")}</p>
            )}
            {latestPay.status === "pending" && (
              <p className="text-xs text-amber-400">Awaiting admin approval.</p>
            )}
            {latestPay.status === "approved" && (
              <p className="text-xs text-emerald-400">✓ Payment confirmed.</p>
            )}
            {latestPay.status === "rejected" && (
              <p className="text-xs text-red-600">Payment rejected.{latestPay.admin_note ? ` Reason: ${latestPay.admin_note}` : " Please contact support."}</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-3 text-xs text-white/40">
            No payment submitted yet.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const { authUser, profile, loading, signOut } = useSession()

  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [fetching, setFetching]       = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [loggingOut, setLoggingOut]   = useState(false)

  // Auth guard
  useEffect(() => {
    if (loading) return
    if (!authUser) { navigate("/login",      { replace: true }); return }
    if (!profile)  { navigate("/onboarding", { replace: true }); return }
  }, [loading, authUser, profile, navigate])

  // Load enrollments
  useEffect(() => {
    if (!authUser) return
    setFetching(true)
    fetchEnrollmentsByUser(authUser.id)
      .then(setEnrollments)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load enrollments."))
      .finally(() => setFetching(false))
  }, [authUser?.id])

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await signOut()
      navigate("/", { replace: true })
    } catch {
      setLoggingOut(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#1a1a1c]">
        <Spinner className="h-8 w-8 text-blue-500" />
      </div>
    )
  }

  const activeEnrollments  = enrollments.filter(e => e.status === "active")
  const pendingEnrollments = enrollments.filter(e => e.status === "pending")

  return (
    <AppShell>
      <div className="px-4 py-6 lg:px-6 space-y-5">

        {/* Greeting */}
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 text-white shadow-lg shadow-emerald-900/30">
          <p className="text-sm font-medium opacity-80">Welcome back,</p>
          <p className="mt-0.5 text-xl font-bold">{profile?.display_name ?? "—"}</p>
          <p className="mt-1 text-xs opacity-70">@{profile?.username}</p>
          <div className="mt-4 flex gap-3">
            <div className="flex-1 rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Active</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{activeEnrollments.length}</p>
            </div>
            <div className="flex-1 rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Pending</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{pendingEnrollments.length}</p>
            </div>
            <div className="flex-1 rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Total</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{enrollments.length}</p>
            </div>
          </div>
        </div>

        {/* Account info */}
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1c] shadow-sm">
          <div className="border-b border-white/[0.06] px-5 py-3">
            <p className="text-sm font-semibold text-white/90">Account</p>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {[
              { label: "Full name",  value: profile?.display_name },
              { label: "Email",      value: profile?.email ?? "—" },
              { label: "Phone",      value: profile?.phone },
              { label: "Username",   value: `@${profile?.username}` },
              { label: "Account No", value: profile?.account_number ?? "—" },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between px-5 py-3">
                <p className="text-xs text-white/40">{row.label}</p>
                <p className="text-sm font-medium text-white/80">{row.value ?? "—"}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-900/30 bg-red-950/30 px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {/* Enrollments */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold text-white/90">My Enrollments</p>
            <button
              onClick={() => navigate("/onboarding")}
              className="rounded-xl bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition"
            >
              + Enroll
            </button>
          </div>

          {fetching ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="h-6 w-6 text-blue-500" />
            </div>
          ) : enrollments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.08] px-6 py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.07] text-xl">📚</div>
              <p className="font-semibold text-white/70">No enrollments yet</p>
              <p className="mt-1 text-sm text-white/40">Enroll in a course to get started.</p>
              <button
                onClick={() => navigate("/onboarding")}
                className="mt-4 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-900/30 hover:bg-emerald-400 transition"
              >
                Browse Courses
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {enrollments.map(e => <EnrollmentCard key={e.id} enrollment={e} />)}
            </div>
          )}
        </div>

        {/* Logout (bottom) */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-900/30 bg-red-950/30 py-3.5 text-sm font-semibold text-red-400 transition hover:bg-red-100 disabled:opacity-50"
        >
          {loggingOut ? <Spinner className="h-4 w-4" /> : (
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 15l3-5-3-5M16 10H7M10 3H5a2 2 0 00-2 2v10a2 2 0 002 2h5"/>
            </svg>
          )}
          Log out
        </button>
      </div>
    </AppShell>
  )
}

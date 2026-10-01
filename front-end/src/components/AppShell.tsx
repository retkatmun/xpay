/**
 * AppShell — shared layout for all authenticated main pages.
 *
 * Provides:
 *  - Sticky top navbar (logo, network switcher, profile avatar)
 *  - Desktop sidebar with nav links + user info
 *  - Mobile bottom tab bar
 *  - Renders children in the main content area
 *
 * Usage: wrap any page that should live inside the app frame.
 */

import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "@/lib/session";
import { Avatar } from "@/components/Avatar";
import { useNetwork } from "@/lib/NetworkContext";
import xpayLogo from "@/assets/xpay_logo.png";

// ─── Nav icons ────────────────────────────────────────────────────────────────

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none"
      stroke={active ? "#10b981" : "rgba(255,255,255,0.4)"}
      strokeWidth={active ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M7 18v-6h6v6" />
    </svg>
  );
}
function ActivityIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none"
      stroke={active ? "#10b981" : "rgba(255,255,255,0.4)"}
      strokeWidth={active ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 10h3l2.5-7 4 14 2.5-7H20" />
    </svg>
  );
}

// ─── Nav definition ───────────────────────────────────────────────────────────

function SendIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none"
      stroke={active ? "#10b981" : "rgba(255,255,255,0.4)"}
      strokeWidth={active ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16L16 4M16 4H8M16 4v8" />
    </svg>
  );
}
function ReceiveIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none"
      stroke={active ? "#10b981" : "rgba(255,255,255,0.4)"}
      strokeWidth={active ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4L4 16M4 16h8M4 16V8" />
    </svg>
  );
}
function SwapIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none"
      stroke={active ? "#10b981" : "rgba(255,255,255,0.4)"}
      strokeWidth={active ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h12M4 6l3-3M4 6l3 3M16 14H4M16 14l-3-3M16 14l-3 3" />
    </svg>
  );
}

const NAV_ITEMS = [
  { label: "Home",    route: "/home",     icon: (a: boolean) => <HomeIcon active={a} /> },
  { label: "Send",    route: "/send",     icon: (a: boolean) => <SendIcon active={a} /> },
  { label: "Receive", route: "/receive",  icon: (a: boolean) => <ReceiveIcon active={a} /> },
  { label: "Swap",    route: "/swap",     icon: (a: boolean) => <SwapIcon active={a} /> },
  { label: "History", route: "/activity", icon: (a: boolean) => <ActivityIcon active={a} /> },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SidebarLink({
  label, route, active, icon,
}: { label: string; route: string; active: boolean; icon: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(route)}
      className={[
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-all",
        active
          ? "bg-emerald-500/[0.12] text-emerald-400"
          : "text-white/60 hover:bg-white/[0.04] hover:text-white/85",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

function BottomTab({
  label, active, icon, onClick,
}: { label: string; active: boolean; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-1 py-2.5 transition-opacity"
    >
      {icon}
      <span className={`text-[10px] font-semibold ${active ? "text-emerald-400" : "text-white/35"}`}>
        {label}
      </span>
    </button>
  );
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useSession();
  const { activeChain: _chain } = useNetwork(); // keep provider active

  const displayName = profile?.display_name || profile?.username || "";
  const isAdmin =
    !!profile?.email &&
    profile.email === (import.meta.env.VITE_ADMIN_EMAIL ?? "admin@xpay.com");

  const currentRoute = location.pathname;

  return (
    <div className="min-h-dvh bg-[#111113] text-white selection:bg-emerald-500/30">

      {/* ── Top navbar ── */}
      <nav className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#111113]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[900px] items-center justify-between px-5">
          <Link to="/home" className="shrink-0">
            <img
              src={xpayLogo}
              alt="XPay"
              className="h-6 w-auto object-contain brightness-0 invert opacity-90"
            />
          </Link>
          <div className="flex items-center gap-2.5">
            <Link
              to="/wallet"
              className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] py-1 pl-3 pr-1.5 transition hover:border-white/20"
            >
              <span className="text-[13px] font-medium text-white/55">{displayName}</span>
              <Avatar name={displayName} size={24} src={profile?.avatar_url} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Body ── */}
      <div className="mx-auto flex max-w-[900px]">

        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:border-r lg:border-white/[0.06]">
          <div className="sticky top-14 flex flex-col gap-1 px-3 pt-6 pb-8">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-white/20">
              Menu
            </p>
            {NAV_ITEMS.map(({ label, route, icon }) => (
              <SidebarLink
                key={route}
                label={label}
                route={route}
                active={currentRoute === route || (route !== "/home" && currentRoute.startsWith(route))}
                icon={icon(currentRoute === route || (route !== "/home" && currentRoute.startsWith(route)))}
              />
            ))}
            <div className="my-3 border-t border-white/[0.06]" />
            <Link
              to="/wallet"
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition hover:bg-white/[0.04]"
            >
              <Avatar name={displayName} size={28} src={profile?.avatar_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-white/70">{displayName}</p>
                <p className="truncate font-mono text-[10px] text-white/30">
                  {profile?.username}.xpay
                </p>
              </div>
            </Link>
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate("/admin")}
                className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.04]"
              >
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none"
                  stroke="rgba(167,139,250,0.6)" strokeWidth="1.75" strokeLinecap="round">
                  <path d="M10 2a2 2 0 012 2v1h3a1 1 0 011 1v11a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1h3V4a2 2 0 012-2z" />
                  <path d="M7 10h6M7 13h4" />
                </svg>
                <span className="text-[13px] font-medium text-violet-300">Admin</span>
              </button>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 pb-24 lg:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-[#111113]/95 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-[480px] items-stretch">
          {NAV_ITEMS.map(({ label, route, icon }) => {
            const active = currentRoute === route || (route !== "/home" && currentRoute.startsWith(route));
            return (
              <BottomTab
                key={route}
                label={label}
                active={active}
                icon={icon(active)}
                onClick={() => navigate(route)}
              />
            );
          })}
        </div>
      </nav>

    </div>
  );
}

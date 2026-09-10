import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useSession } from "@/lib/session";
import xpayLogo from "@/assets/xpay_logo.png";

// ─── Animated counter ─────────────────────────────────────────────────────────
function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      let start: number | null = null;
      const dur = 1400;
      const step = (ts: number) => {
        if (!start) start = ts;
        const p = Math.min((ts - start) / dur, 1);
        setVal(Math.floor(p * p * to));
        if (p < 1) requestAnimationFrame(step);
        else setVal(to);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.5 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

// ─── Bank logos (SVG wordmarks / colored initials) ────────────────────────────
const BANK_LOGOS: { name: string; color: string; bg: string; abbr: string }[] = [
  { name: "Access Bank",  color: "#FF6600", bg: "#FFF0E6", abbr: "AC" },
  { name: "GTBank",       color: "#F58220", bg: "#FFF4E8", abbr: "GT" },
  { name: "First Bank",   color: "#003A7D", bg: "#E6EDF8", abbr: "FB" },
  { name: "Zenith Bank",  color: "#E31837", bg: "#FCEAED", abbr: "ZB" },
  { name: "UBA",          color: "#CC0000", bg: "#FCEAEA", abbr: "UBA" },
  { name: "FCMB",         color: "#004A97", bg: "#E6EDF8", abbr: "FCMB" },
  { name: "Kuda",         color: "#5034F5", bg: "#EEEAFF", abbr: "KD" },
  { name: "OPay",         color: "#22AC5E", bg: "#E6F7EE", abbr: "OP" },
  { name: "Moniepoint",   color: "#2D6BE4", bg: "#EAF0FC", abbr: "MP" },
  { name: "Sterling",     color: "#CF0A2C", bg: "#FCEAED", abbr: "ST" },
];

function BankLogo({ bank }: { bank: typeof BANK_LOGOS[0] }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-white px-4 py-2.5 shadow-sm">
      <div
        className="flex h-7 w-7 items-center justify-center rounded-lg text-[9px] font-extrabold tracking-tight"
        style={{ background: bank.bg, color: bank.color }}
      >
        {bank.abbr}
      </div>
      <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">{bank.name}</span>
    </div>
  );
}

// ─── Hero transfer card ───────────────────────────────────────────────────────
function HeroVisual() {
  return (
    <div className="relative w-full max-w-[340px] select-none">
      {/* Soft glow */}
      <div className="absolute inset-0 -z-10 rounded-3xl bg-blue-200/40 blur-3xl scale-110" />

      {/* Main card */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl shadow-blue-100/60">
        <div className="flex items-center justify-between mb-5">
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Send money</span>
          <span className="flex items-center gap-1.5 rounded-full bg-green-50 border border-green-100 px-3 py-1 text-xs font-semibold text-green-600">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Live rate
          </span>
        </div>

        <div className="mb-5">
          <p className="text-4xl font-bold tracking-tight text-gray-900">$250<span className="text-gray-300">.00</span></p>
          <p className="mt-1 text-sm text-gray-400">≈ ₦412,500 to recipient</p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-sm font-bold text-white shrink-0">
              OA
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Ola Adeyemi</p>
              <p className="text-xs text-gray-400">GTBank · ****5421</p>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-green-50 border border-green-100 px-2.5 py-1">
              <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 6l2.5 2.5 5.5-5" />
              </svg>
              <span className="text-[10px] font-semibold text-green-600">Verified</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-100 px-4 py-2.5 mb-5">
          <span className="text-xs text-gray-400">Exchange rate</span>
          <span className="text-xs font-semibold text-gray-700 tabular-nums">$1 = ₦1,650</span>
        </div>

        <div className="flex h-12 items-center justify-center rounded-2xl bg-blue-600 text-sm font-semibold text-white shadow-lg shadow-blue-200">
          Confirm with PIN →
        </div>
      </div>

      {/* Floating success notification */}
      <div className="absolute -right-5 -top-4 flex items-center gap-2.5 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 shadow-xl">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8l3.5 3.5 6.5-7" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-900">Sent!</p>
          <p className="text-[10px] text-gray-400">₦412,500 · just now</p>
        </div>
      </div>

      {/* Floating PIN badge */}
      <div className="absolute -left-4 -bottom-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 shadow-lg">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100">
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="12" height="8" rx="1.5" />
            <path d="M5 7V5.5a3 3 0 016 0V7" />
          </svg>
        </div>
        <span className="text-[11px] font-semibold text-gray-600">PIN secured</span>
      </div>
    </div>
  );
}

// ─── Landing ──────────────────────────────────────────────────────────────────
export default function Landing() {
  const { authUser, profile, loading } = useSession();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && authUser && profile) navigate("/home", { replace: true });
    else if (!loading && authUser && !profile) navigate("/onboarding", { replace: true });
  }, [loading, authUser, profile, navigate]);

  if (loading || authUser) return <div className="min-h-dvh bg-white" />;

  return (
    <div className="min-h-dvh overflow-x-hidden bg-white font-[var(--font-public-sans)] text-gray-900">

      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <img src={xpayLogo} alt="XPay" className="h-8 w-auto object-contain" />

          <div className="hidden items-center gap-8 md:flex">
            {[["#how-it-works", "How it works"], ["#features", "Features"], ["#security", "Security"]].map(([href, label]) => (
              <a key={href} href={href} className="text-sm text-gray-500 transition hover:text-gray-900">{label}</a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link to="/login" className="hidden rounded-xl px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 md:block">
              Log in
            </Link>
            <Link to="/onboarding" className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700">
              Get started
            </Link>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-50 md:hidden"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                {menuOpen ? <><path d="M4 4l12 12M16 4L4 16" /></> : <><path d="M3 5h14M3 10h14M3 15h14" /></>}
              </svg>
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-gray-100 bg-white px-6 pb-4 md:hidden">
            <div className="flex flex-col gap-1 pt-3">
              {[["#how-it-works", "How it works"], ["#features", "Features"], ["#security", "Security"]].map(([href, label]) => (
                <a key={href} href={href} onClick={() => setMenuOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">{label}</a>
              ))}
              <Link to="/login" className="rounded-xl px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">Log in</Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white pt-16 pb-24 md:pt-20 md:pb-32">
        {/* Subtle dot grid */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: "radial-gradient(circle, #2563eb 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        {/* Blue radial top-right */}
        <div className="pointer-events-none absolute right-0 top-0 h-[600px] w-[600px] -translate-y-20 translate-x-32 rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, #2563eb 0%, transparent 70%)" }} />

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-6 lg:grid-cols-2">
          {/* Left */}
          <div className="max-w-lg">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">Now live · Base · USDC</span>
            </div>

            <h1 className="text-[3.25rem] font-extrabold leading-[1.06] tracking-[-0.03em] text-gray-900 sm:text-[3.75rem]">
              Send dollars.<br />
              <span className="text-blue-600">Receive naira.</span><br />
              No P2P.
            </h1>

            <p className="mt-6 text-[1.05rem] leading-relaxed text-gray-500 max-w-md">
              Move USDC to any Nigerian phone number, @handle, or bank account — it arrives as naira in seconds. No crypto knowledge needed.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/onboarding"
                className="group inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-7 py-3.5 text-[0.95rem] font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 active:scale-[.98]">
                Create free account
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition group-hover:translate-x-0.5">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </Link>
              <a href="#how-it-works"
                className="inline-flex items-center rounded-2xl border border-gray-200 bg-white px-7 py-3.5 text-[0.95rem] font-medium text-gray-700 transition hover:bg-gray-50 hover:border-gray-300">
                How it works
              </a>
            </div>

            <p className="mt-4 text-sm text-gray-400">Setup in under a minute · No crypto knowledge required</p>

            {/* Stats */}
            <div className="mt-10 flex gap-8 border-t border-gray-100 pt-8">
              {[
                { label: "Platform fee", value: "0", suffix: "%" },
                { label: "Banks supported", value: 40, suffix: "+" },
                { label: "Avg. settlement", value: "< 60", suffix: "s" },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-2xl font-extrabold tracking-tight text-gray-900">
                    {typeof s.value === "number"
                      ? <Counter to={s.value} suffix={s.suffix} />
                      : <>{s.value}{s.suffix}</>}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right */}
          <div className="flex justify-center lg:justify-end">
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* ── Bank marquee ────────────────────────────────────────────────── */}
      <div className="border-y border-gray-100 bg-gray-50 py-5 overflow-hidden">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest text-gray-400">
          Send to any Nigerian bank
        </p>
        <div className="relative overflow-hidden">
          <div className="flex animate-[marquee_30s_linear_infinite] items-center gap-3">
            {[...BANK_LOGOS, ...BANK_LOGOS, ...BANK_LOGOS].map((b, i) => (
              <BankLogo key={i} bank={b} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-600">Why XPay</p>
            <h2 className="text-[2.25rem] font-extrabold tracking-[-0.025em] text-gray-900">
              Built for how money really moves
            </h2>
            <p className="mt-4 text-gray-500 max-w-xl mx-auto">
              Every feature is built around one goal — your money arrives quickly, accurately, and securely.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                ),
                bg: "bg-blue-50",
                title: "Instant settlement",
                desc: "Payments clear in under 60 seconds. No intermediaries slowing things down.",
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#7c3aed" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                ),
                bg: "bg-violet-50",
                title: "Bank verification",
                desc: "Account names verified against the bank before you send — zero wrong-account errors.",
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#059669" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                ),
                bg: "bg-green-50",
                title: "Transparent rates",
                desc: "See your exact exchange rate and fee before you confirm. No hidden surprises.",
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#dc2626" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                ),
                bg: "bg-red-50",
                title: "PIN protection",
                desc: "Every transfer requires your 4-digit PIN. Rate-limited and securely hashed.",
              },
            ].map((f) => (
              <div key={f.title}
                className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-gray-200">
                <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl ${f.bg}`}>
                  {f.icon}
                </div>
                <h3 className="font-bold text-gray-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section id="how-it-works" className="border-t border-gray-100 bg-gray-50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-600">Process</p>
            <h2 className="text-[2.25rem] font-extrabold tracking-[-0.025em] text-gray-900">
              Four steps. 60 seconds.
            </h2>
            <p className="mt-4 text-gray-500">No crypto knowledge required.</p>
          </div>

          <div className="relative grid gap-8 lg:grid-cols-4">
            {/* connector */}
            <div className="absolute top-7 left-[calc(12.5%+20px)] right-[calc(12.5%+20px)] hidden h-px bg-gray-200 lg:block" />

            {[
              {
                icon: (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                ),
                n: "01", title: "Choose recipient",
                desc: "Enter an XPay handle, phone number, or Nigerian bank account.",
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
                n: "02", title: "Verify account",
                desc: "We confirm the account name from the bank. No wrong transfers.",
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                ),
                n: "03", title: "Review your rate",
                desc: "See the live rate, fee, and exact NGN amount — all upfront.",
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                ),
                n: "04", title: "Confirm with PIN",
                desc: "Authorise with your 4-digit PIN. Funds sent instantly.",
              },
            ].map((s) => (
              <div key={s.n} className="relative flex flex-col items-start lg:items-center lg:text-center">
                <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-gray-100 bg-white shadow-sm mb-4">
                  {s.icon}
                  <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                    {parseInt(s.n)}
                  </span>
                </div>
                <h3 className="font-bold text-gray-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Send to anyone ─────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-600">Reach</p>
            <h2 className="text-[2.25rem] font-extrabold tracking-[-0.025em] text-gray-900">
              Send to anyone in Nigeria
            </h2>
            <p className="mt-4 text-gray-500">They don&apos;t even need an XPay account.</p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {/* XPay user */}
            <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm transition hover:shadow-md">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900">XPay user</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-500">
                Any XPay handle or phone number.{" "}
                <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[0.78rem] text-gray-700">@scholar</span>
                {" "}or{" "}
                <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[0.78rem] text-gray-700">08031234567</span>
                {" "}— resolved in milliseconds.
              </p>
              <div className="mt-6 flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-xs font-bold text-white shrink-0">SC</div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Scholar Chidi</p>
                  <p className="text-xs text-gray-400">@scholar · XPay user</p>
                </div>
                <div className="ml-auto flex items-center gap-1 rounded-full bg-green-50 border border-green-100 px-2.5 py-1">
                  <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 6l2.5 2.5 5.5-5" />
                  </svg>
                  <span className="text-[10px] font-semibold text-green-600">Verified</span>
                </div>
              </div>
            </div>

            {/* Bank account */}
            <div className="rounded-3xl border border-blue-100 bg-blue-600 p-8 text-white shadow-lg shadow-blue-200">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold">Nigerian bank account</h3>
              <p className="mt-3 text-sm leading-relaxed text-blue-100">
                No XPay account needed. Enter the bank and 10-digit account number. We verify the name and settle NGN directly.
              </p>
              <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 p-5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">Verified account</p>
                <p className="text-base font-bold uppercase tracking-wide">SCHOLAR GAMALIEL</p>
                <p className="mt-1 text-xs text-blue-200/70">Access Bank · ****6789</p>
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-300 animate-pulse" />
                  <span className="text-[11px] font-semibold text-green-300">Account verified</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Security ───────────────────────────────────────────────────── */}
      <section id="security" className="border-t border-gray-100 bg-gray-50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-600">Security</p>
            <h2 className="text-[2.25rem] font-extrabold tracking-[-0.025em] text-gray-900">
              Your money deserves better security
            </h2>
            <p className="mt-4 text-gray-500 max-w-lg mx-auto">
              Every protection is built into the transaction flow — not bolted on after.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {[
              {
                icon: (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                ),
                title: "PIN-gated transfers",
                desc: "Every transfer requires your 4-digit PIN. Hashed securely — never stored in plain text.",
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                ),
                title: "On-chain transparency",
                desc: "Every USDC movement is a public Base transaction. Verify any transfer on BaseScan.",
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                ),
                title: "Non-custodial wallet",
                desc: "Your embedded wallet is yours. Powered by Privy — only you can authorise transactions.",
              },
            ].map((s) => (
              <div key={s.title} className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm transition hover:shadow-md">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
                  {s.icon}
                </div>
                <h3 className="font-bold text-gray-900">{s.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-gray-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <div className="rounded-3xl border border-blue-100 bg-blue-600 px-8 py-16 shadow-2xl shadow-blue-200">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-widest text-white/80">Open now</span>
            </div>
            <h2 className="text-[2.5rem] font-extrabold leading-[1.08] tracking-[-0.03em] text-white">
              Ready to move money<br />differently?
            </h2>
            <p className="mt-5 text-[1.05rem] leading-relaxed text-blue-100 max-w-md mx-auto">
              Create your XPay account in under a minute. Send USDC that arrives as naira — instantly.
            </p>
            <Link to="/onboarding"
              className="mt-8 inline-flex items-center gap-2.5 rounded-2xl bg-white px-9 py-4 text-base font-semibold text-blue-600 shadow-xl shadow-blue-900/20 transition hover:bg-blue-50 active:scale-[.98]">
              Create free account
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
            <p className="mt-4 text-sm text-white/40">No credit card · Takes under a minute</p>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 bg-white py-14">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <img src={xpayLogo} alt="XPay" className="h-7 w-auto object-contain mb-3" />
              <p className="text-sm leading-relaxed text-gray-500">Send dollars. Receive naira.<br />No P2P. No stress.</p>
              <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                All systems operational
              </div>
            </div>
            {[
              { heading: "Product", items: ["How it works", "Features", "Security"] },
              { heading: "Company", items: ["About", "Contact", "Blog"] },
              { heading: "Legal",   items: ["Privacy", "Terms", "Cookies"] },
            ].map((col) => (
              <div key={col.heading}>
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">{col.heading}</p>
                <ul className="space-y-2.5">
                  {col.items.map((item) => (
                    <li key={item}><span className="text-sm text-gray-500 cursor-pointer transition hover:text-gray-900">{item}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-gray-100 pt-8 sm:flex-row sm:items-center">
            <p className="text-xs text-gray-400">© 2026 XPay. All rights reserved.</p>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Powered by Base</span>
              <span className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Secured by Privy</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}

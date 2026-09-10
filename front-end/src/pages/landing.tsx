import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useSession } from "@/lib/session";
import xpayLogo from "@/assets/xpay_logo.png";
import { getBankLogo, getNetworkLogo, getTokenLogo } from "@/assets/logos";

// ─── Animated counter ─────────────────────────────────────────────────────────
function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      let start: number | null = null;
      const dur = 1600;
      const step = (ts: number) => {
        if (!start) start = ts;
        const p = Math.min((ts - start) / dur, 1);
        setVal(Math.floor(p * p * to));
        if (p < 1) requestAnimationFrame(step);
        else setVal(to);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.4 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

// ─── Nigerian banks with real brand colors ────────────────────────────────────
const BANKS = [
  { name: "Access Bank",   abbr: "AC",   color: "#FF6B00", bg: "#fff3eb", text: "#FF6B00" },
  { name: "GTBank",        abbr: "GT",   color: "#F58220", bg: "#fff5eb", text: "#E5701A" },
  { name: "First Bank",    abbr: "FB",   color: "#003A7D", bg: "#e8eef8", text: "#003A7D" },
  { name: "Zenith Bank",   abbr: "ZB",   color: "#E31837", bg: "#fdeaed", text: "#C01530" },
  { name: "UBA",           abbr: "UBA",  color: "#CC0000", bg: "#fdeaea", text: "#CC0000" },
  { name: "Kuda",          abbr: "KD",   color: "#5B2FF8", bg: "#eeebff", text: "#5B2FF8" },
  { name: "OPay",          abbr: "OP",   color: "#1BA94C", bg: "#e6f7ec", text: "#1BA94C" },
  { name: "Moniepoint",    abbr: "MP",   color: "#0033A0", bg: "#e6ecf8", text: "#0033A0" },
  { name: "Palmpay",       abbr: "PP",   color: "#07C160", bg: "#e6f9ef", text: "#07C160" },
  { name: "Sterling",      abbr: "ST",   color: "#CF0A2C", bg: "#fdeaed", text: "#CF0A2C" },
  { name: "FCMB",          abbr: "FCMB", color: "#004A97", bg: "#e6edf8", text: "#004A97" },
  { name: "Wema Bank",     abbr: "WB",   color: "#7B2D8B", bg: "#f3eaf6", text: "#7B2D8B" },
  { name: "Fidelity",      abbr: "FD",   color: "#006338", bg: "#e6f2ec", text: "#006338" },
  { name: "Polaris",       abbr: "PL",   color: "#E4002B", bg: "#fdeaed", text: "#C4001E" },
];

// Coin/network chips
const COINS = [
  { symbol: "USDC", network: "Ethereum", color: "#2775CA", bg: "#EBF3FD" },
  { symbol: "USDT", network: "Ethereum", color: "#26A17B", bg: "#E6F5F0" },
  { symbol: "USDC", network: "Base",     color: "#0052FF", bg: "#E6EEFF" },
  { symbol: "USDT", network: "Tron",     color: "#FF060A", bg: "#FFEAEA" },
  { symbol: "USDC", network: "Polygon",  color: "#8247E5", bg: "#F0EBFE" },
  { symbol: "USDT", network: "BNB",      color: "#F0B90B", bg: "#FEF8E6" },
];

function BankChip({ bank }: { bank: typeof BANKS[0] }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-gray-100 bg-white px-4 py-2.5 shadow-sm">
      <img 
        src={getBankLogo(bank.name)} 
        alt={bank.name} 
        className="h-8 w-8 rounded-xl object-cover shrink-0" 
      />
      <span className="whitespace-nowrap text-sm font-semibold text-gray-700">{bank.name}</span>
    </div>
  );
}

// ─── Hero card (futuristic, soft light theme) ─────────────────────────────────
function HeroCard() {
  const [activeNetwork, setActiveNetwork] = useState(0);
  const networks = ["Ethereum", "Base", "Tron", "Polygon", "BNB"];

  return (
    <div className="relative w-full max-w-[360px] select-none mx-auto">
      {/* Soft ambient glows */}
      <div className="pointer-events-none absolute -top-10 -left-10 h-52 w-52 rounded-full bg-blue-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 -right-10 h-52 w-52 rounded-full bg-indigo-300/20 blur-3xl" />

      {/* Card */}
      <div className="relative overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-2xl shadow-blue-100/60">
        {/* Subtle dot grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: "radial-gradient(#2563eb 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        {/* Top shimmer line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent" />

        {/* Card header */}
        <div className="relative border-b border-blue-50 bg-gradient-to-br from-blue-600 to-blue-700 px-5 py-4">
          {/* Subtle grid on header */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          <div className="relative flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-200">
              Receive &amp; Convert
            </p>
            <span className="flex items-center gap-1.5 rounded-full border border-green-400/30 bg-green-400/15 px-3 py-1 text-[11px] font-semibold text-green-300">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          </div>
          <div className="relative mt-2 flex items-end gap-2">
            <p className="text-3xl font-extrabold tracking-tight text-white">$500</p>
            <span className="mb-1 text-sm font-semibold text-blue-200">USDC</span>
          </div>
          <div className="relative mt-0.5 flex items-center gap-2">
            <span className="text-xs text-blue-300">converts to</span>
            <span className="rounded-lg border border-white/20 bg-white/15 px-2 py-0.5 text-xs font-bold text-white">
              ₦825,000
            </span>
          </div>
        </div>

        {/* Network select */}
        <div className="border-b border-gray-100 px-5 py-3">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400">Network</p>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {networks.map((n, i) => (
              <button
                key={n}
                onClick={() => setActiveNetwork(i)}
                className={[
                  "shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all",
                  activeNetwork === i
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
                    : "bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600",
                ].join(" ")}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Coin + rate */}
        <div className="px-5 py-4 space-y-3">
          {/* Coins */}
          <div className="flex gap-2">
            {[
              { s: "USDC", c: "#2775CA", bg: "#EBF3FD", border: "border-blue-100" },
              { s: "USDT", c: "#26A17B", bg: "#E6F5F0", border: "border-green-100" },
            ].map((coin) => (
              <div
                key={coin.s}
                className={`flex flex-1 items-center gap-2 rounded-xl border ${coin.border} px-3 py-2.5`}
                style={{ background: coin.bg }}
              >
                <img
                  src={getTokenLogo(coin.s)}
                  alt={coin.s}
                  className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-white/80"
                />
                <div>
                  <p className="text-xs font-bold" style={{ color: coin.c }}>{coin.s}</p>
                  <p className="text-[10px] text-gray-400">Supported</p>
                </div>
              </div>
            ))}
          </div>

          {/* Rate row */}
          <div className="flex items-center justify-between rounded-xl border border-blue-50 bg-blue-50/60 px-4 py-2.5">
            <span className="text-xs text-gray-400">Rate</span>
            <span className="text-sm font-bold tabular-nums text-blue-700">$1 = ₦1,650</span>
          </div>

          {/* Recipient */}
          <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              OA
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Ola Adeyemi</p>
              <p className="text-xs text-gray-400">GTBank · ****5421</p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-green-50 border border-green-100 px-2 py-0.5">
              <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 6l2.5 2.5 5.5-5" />
              </svg>
              <span className="text-[10px] font-semibold text-green-600">Verified</span>
            </span>
          </div>

          {/* CTA */}
          <div className="relative overflow-hidden flex h-11 items-center justify-center rounded-2xl bg-blue-600 text-sm font-semibold text-white shadow-md shadow-blue-200">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-12 animate-[shimmer_2.8s_ease-in-out_infinite]" />
            <span className="relative">Convert &amp; Send ₦825,000</span>
          </div>
        </div>

        {/* Bottom shimmer line */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-blue-300/40 to-transparent" />
      </div>

      {/* Float: success toast */}
      <div className="absolute -right-4 top-8 flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3.5 py-2.5 shadow-xl shadow-blue-100/40">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100">
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8l3.5 3.5 6.5-7" />
          </svg>
        </div>
        <div>
          <p className="text-[11px] font-bold text-gray-900">₦825,000 sent!</p>
          <p className="text-[10px] text-gray-400">2 sec ago</p>
        </div>
      </div>

      {/* Float: PIN badge */}
      <div className="absolute -left-4 bottom-12 flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-lg">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100">
          <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="12" height="8" rx="1.5" /><path d="M5 7V5.5a3 3 0 016 0V7" />
          </svg>
        </div>
        <span className="text-[11px] font-semibold text-gray-600">PIN secured</span>
      </div>
    </div>
  );
}

// ─── Main Landing ──────────────────────────────────────────────────────────────
export default function Landing() {
  const { authUser, profile, loading } = useSession();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // Remove automatic redirect - allow logged-in users to see the landing page
  // useEffect(() => {
  //   if (!loading && authUser && profile) navigate("/home", { replace: true });
  //   else if (!loading && authUser && !profile) navigate("/onboarding", { replace: true });
  // }, [loading, authUser, profile, navigate]);

  // if (loading || authUser) return <div className="min-h-dvh bg-white" />;

  const isLoggedIn = !loading && authUser && profile;

  return (
    <div className="min-h-dvh overflow-x-hidden bg-white font-[var(--font-public-sans)] text-gray-900 antialiased">

      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-100/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center">
            <img src={xpayLogo} alt="XPay" className="h-8 w-auto object-contain" />
          </div>

          <div className="hidden items-center gap-6 md:flex lg:gap-8">
            {[
              ["#how-it-works", "How it works"],
              ["#networks", "Networks"],
              ["#features", "Features"],
              ["#security", "Security"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="text-sm font-medium text-gray-500 transition hover:text-gray-900">
                {label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {!isLoggedIn ? (
              <>
                <Link to="/login" className="hidden rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 sm:block">
                  Log in
                </Link>
                <Link
                  to="/onboarding"
                  className="w-full sm:w-auto rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-100 transition hover:bg-blue-700 active:scale-[.98] text-center"
                >
                  Get started
                </Link>
              </>
            ) : (
              <Link
                to="/home"
                className="w-full sm:w-auto rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-100 transition hover:bg-blue-700 active:scale-[.98] text-center"
              >
                Dashboard
              </Link>
            )}
            <button
              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 md:hidden"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu"
            >
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                {menuOpen
                  ? <><path d="M4 4l12 12M16 4L4 16" /></>
                  : <><path d="M3 5h14M3 10h14M3 15h14" /></>}
              </svg>
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-gray-100 bg-white px-4 pb-4 md:hidden">
            <div className="flex flex-col gap-1 pt-3">
              {[
                ["#how-it-works", "How it works"],
                ["#networks", "Networks"],
                ["#features", "Features"],
                ["#security", "Security"],
              ].map(([href, label]) => (
                <a key={href} href={href} onClick={() => setMenuOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  {label}
                </a>
              ))}
              {!isLoggedIn ? (
                <>
                  <Link to="/login" onClick={() => setMenuOpen(false)}
                    className="rounded-xl px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    Log in
                  </Link>
                  <Link to="/onboarding" onClick={() => setMenuOpen(false)}
                    className="mt-1 rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white text-center hover:bg-blue-700">
                    Create free account
                  </Link>
                </>
              ) : (
                <Link to="/home" onClick={() => setMenuOpen(false)}
                  className="mt-1 rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white text-center hover:bg-blue-700">
                  Dashboard
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white pt-20 pb-16 sm:pt-24 sm:pb-20 lg:pt-28 lg:pb-24">
        {/* Soft dot grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "radial-gradient(#2563eb 1px, transparent 1px)", backgroundSize: "28px 28px" }}
        />
        {/* Soft ambient orbs */}
        <div className="pointer-events-none absolute right-0 top-0 h-[600px] w-[600px] -translate-y-24 translate-x-24 rounded-full bg-blue-100 opacity-60 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-[500px] w-[500px] translate-y-24 -translate-x-24 rounded-full bg-indigo-50 opacity-70 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-16">
            {/* Left copy */}
            <div className="text-center lg:text-left">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-widest text-blue-700">
                  Multi-chain · USDC &amp; USDT
                </span>
              </div>

              <h1 className="text-3xl font-extrabold leading-tight tracking-[-0.03em] text-gray-900 sm:text-4xl lg:text-5xl">
                Receive crypto.<br />
                <span className="text-blue-600">
                  Convert to naira.
                </span><br />
                Instantly.
              </h1>

              <p className="mt-6 text-lg leading-relaxed text-gray-500 max-w-2xl mx-auto lg:mx-0">
                Deposit USDC or USDT from Ethereum, Base, Tron, Polygon or BNB Chain. XPay converts it to Nigerian naira and pays out to any bank account in seconds.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center lg:justify-start">
                {!isLoggedIn ? (
                  <Link
                    to="/onboarding"
                    className="group inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-2xl bg-blue-600 px-8 py-4 text-base font-semibold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 active:scale-[.98]"
                  >
                    Create free account
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition group-hover:translate-x-0.5">
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  </Link>
                ) : (
                  <Link
                    to="/home"
                    className="group inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-2xl bg-blue-600 px-8 py-4 text-base font-semibold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 active:scale-[.98]"
                  >
                    Go to Dashboard
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition group-hover:translate-x-0.5">
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  </Link>
                )}
                <a
                  href="#how-it-works"
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-8 py-4 text-base font-semibold text-gray-700 transition hover:bg-gray-50 hover:border-gray-300"
                >
                  How it works
                </a>
              </div>

              <p className="mt-6 text-sm text-gray-400 text-center lg:text-left">Free to sign up · No crypto experience needed</p>

              {/* Stats */}
              <div className="mt-10 grid grid-cols-3 gap-6 border-t border-gray-100 pt-8">
                {[
                  { label: "Networks supported", value: 5, suffix: "+" },
                  { label: "Nigerian banks", value: 40, suffix: "+" },
                  { label: "Avg. payout time", value: "< 60", suffix: "s" },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="text-xl sm:text-2xl font-extrabold tracking-tight text-gray-900">
                      {typeof s.value === "number"
                        ? <Counter to={s.value} suffix={s.suffix} />
                        : <>{s.value}{s.suffix}</>}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right card */}
            <div className="flex justify-center mt-8 lg:mt-0">
              <HeroCard />
            </div>
          </div>
        </div>
      </section>

      {/* ── Supported networks ──────────────────────────────────────────── */}
      <section id="networks" className="border-y border-gray-100 bg-gray-50/50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-600">Multi-chain</p>
            <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl lg:text-4xl">
              Deposit from any major network
            </h2>
            <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">We accept USDC and USDT from 6 networks, all converting to naira.</p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { name: "Ethereum",  symbol: "ETH", color: "#627EEA", bg: "#EEF0FE", coins: "USDC · USDT" },
              { name: "Base",      symbol: "BASE", color: "#0052FF", bg: "#E6EEFF", coins: "USDC · USDT" },
              { name: "Tron",      symbol: "TRX", color: "#FF060A", bg: "#FFEAEA", coins: "USDT" },
              { name: "Polygon",   symbol: "POL", color: "#8247E5", bg: "#F0EBFE", coins: "USDC · USDT" },
              { name: "BNB Chain", symbol: "BNB", color: "#F0B90B", bg: "#FEF8E6", coins: "USDT" },
              { name: "Solana",    symbol: "SOL", color: "#9945FF", bg: "#F3EAFF", coins: "USDC · USDT" },
            ].map((n) => (
              <div
                key={n.name}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 sm:p-6 shadow-sm transition hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <span className="text-xs sm:text-sm font-bold text-gray-600">
                    {n.symbol.slice(0, 3)}
                  </span>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-900">{n.name}</p>
                  <p className="text-xs font-semibold text-gray-400">{n.coins}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Coin badges */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {COINS.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-full border border-gray-100 px-4 py-2 shadow-sm"
                style={{ background: c.bg }}
              >
                <div className="h-5 w-5 rounded-full bg-gray-600 flex items-center justify-center">
                  <span className="text-xs font-black text-white">$</span>
                </div>
                <span className="text-xs font-bold" style={{ color: c.color }}>{c.symbol}</span>
                <span className="text-xs text-gray-400">on {c.network}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bank marquee ────────────────────────────────────────────────── */}
      <div className="overflow-hidden border-b border-gray-100 py-8">
        <p className="mb-5 text-center text-xs font-bold uppercase tracking-widest text-gray-400">
          Payout to any Nigerian bank
        </p>
        <div className="relative">
          {/* Fade edges */}
          <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-20 bg-gradient-to-r from-white to-transparent" />
          <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-20 bg-gradient-to-l from-white to-transparent" />
          <div className="flex animate-[marquee_35s_linear_infinite] items-center gap-3">
            {[...BANKS, ...BANKS, ...BANKS].map((b, i) => (
              <BankChip key={i} bank={b} />
            ))}
          </div>
        </div>
      </div>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="mb-14 text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-600">Process</p>
            <h2 className="text-[2.25rem] font-extrabold tracking-[-0.025em] text-gray-900">
              Four steps. Under 60 seconds.
            </h2>
            <p className="mt-4 text-gray-500">No crypto knowledge needed. Just deposit and get paid.</p>
          </div>

          <div className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* Connector line desktop */}
            <div className="absolute top-8 left-[calc(12.5%+28px)] right-[calc(12.5%+28px)] hidden h-px bg-gray-200 lg:block" />

            {[
              {
                n: "01",
                color: "from-blue-500 to-blue-600",
                icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>,
                title: "Choose your coin",
                desc: "Pick USDC or USDT and select the blockchain network you're sending from.",
              },
              {
                n: "02",
                color: "from-indigo-500 to-indigo-600",
                icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                title: "Enter recipient",
                desc: "An XPay @handle, phone number, or any Nigerian bank account number.",
              },
              {
                n: "03",
                color: "from-violet-500 to-violet-600",
                icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
                title: "Review rate",
                desc: "See the live NGN conversion rate and exact payout amount — no hidden fees.",
              },
              {
                n: "04",
                color: "from-blue-600 to-indigo-600",
                icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>,
                title: "Confirm with PIN",
                desc: "Approve with your 4-digit PIN. Naira lands in the bank account instantly.",
              },
            ].map((s) => (
              <div key={s.n} className="relative flex flex-col items-center text-center">
                <div className={`relative z-10 mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 shadow-md shadow-blue-100`}>
                  {s.icon}
                  <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-[9px] font-bold text-white">
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

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section id="features" className="border-t border-gray-100 bg-gray-50/50 py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="mb-14 text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-600">Why XPay</p>
            <h2 className="text-[2.25rem] font-extrabold tracking-[-0.025em] text-gray-900">
              Built for how money really moves
            </h2>
            <p className="mt-4 text-gray-500 max-w-xl mx-auto">
              Every feature is designed for speed, accuracy, and security — so your naira arrives exactly where it should.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                gradient: "from-blue-500 to-blue-600",
                bg: "bg-blue-50",
                iconColor: "#2563eb",
                icon: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
                title: "Instant payout",
                desc: "Funds converted and sent to any Nigerian bank in under 60 seconds.",
              },
              {
                gradient: "from-violet-500 to-violet-600",
                bg: "bg-violet-50",
                iconColor: "#7c3aed",
                icon: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
                title: "Bank verification",
                desc: "Account name resolved from the bank before you send. Zero wrong transfers.",
              },
              {
                gradient: "from-emerald-500 to-emerald-600",
                bg: "bg-emerald-50",
                iconColor: "#059669",
                icon: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
                title: "Live rates",
                desc: "See the exact exchange rate and naira amount before every confirmation.",
              },
              {
                gradient: "from-rose-500 to-rose-600",
                bg: "bg-rose-50",
                iconColor: "#e11d48",
                icon: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>,
                title: "PIN-protected",
                desc: "Every payout needs your 4-digit PIN. Securely hashed, never stored plain.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${f.bg}`} style={{ color: f.iconColor }}>
                  {f.icon}
                </div>
                <h3 className="font-bold text-gray-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Send to anyone ─────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="mb-12 text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-600">Recipients</p>
            <h2 className="text-[2.25rem] font-extrabold tracking-[-0.025em] text-gray-900">
              Pay anyone in Nigeria
            </h2>
            <p className="mt-4 text-gray-500">They don't even need an XPay account.</p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {/* XPay handle */}
            <div className="rounded-3xl border border-gray-100 bg-white p-7 shadow-sm transition hover:shadow-md hover:-translate-y-0.5">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">@XPay handle</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                Send to any XPay username instantly. Just type <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-700">@username</code> and go.
              </p>
              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">SC</div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Scholar Chidi</p>
                  <p className="text-xs text-gray-400">@scholar</p>
                </div>
                <span className="ml-auto rounded-full bg-green-50 border border-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-600">✓ XPay</span>
              </div>
            </div>

            {/* Phone number */}
            <div className="rounded-3xl border border-blue-100 bg-blue-600 p-7 text-white shadow-md shadow-blue-100">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold">Phone number</h3>
              <p className="mt-2 text-sm leading-relaxed text-blue-100">
                Send to any Nigerian mobile number. No XPay account required — naira goes straight to their bank.
              </p>
              <div className="mt-5 rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
                <p className="font-mono text-sm font-semibold text-white">+234 803 123 4567</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                  <p className="text-xs text-blue-200">Number verified</p>
                </div>
              </div>
            </div>

            {/* Bank account */}
            <div className="rounded-3xl border border-gray-100 bg-white p-7 shadow-sm transition hover:shadow-md hover:-translate-y-0.5">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#059669" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Bank account</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                Enter any 10-digit Nigerian bank account number. We verify the name and pay out naira directly.
              </p>
              <div className="mt-5 rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Verified</p>
                <p className="mt-1 font-bold uppercase text-gray-900">ADEYEMI OLAWALE</p>
                <p className="text-xs text-gray-400">Access Bank · ****6789</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Security ───────────────────────────────────────────────────── */}
      <section id="security" className="border-t border-gray-100 bg-gray-50/50 py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="mb-14 text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-600">Security</p>
            <h2 className="text-[2.25rem] font-extrabold tracking-[-0.025em] text-gray-900">
              Security built in, not bolted on
            </h2>
            <p className="mt-4 text-gray-500 max-w-lg mx-auto">
              Every protection is woven into the transaction flow itself.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {[
              {
                bg: "bg-blue-50",
                color: "#2563eb",
                icon: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>,
                title: "PIN-gated transfers",
                desc: "Every conversion and payout needs your 4-digit PIN. Hashed and rate-limited — never stored in plain text.",
              },
              {
                bg: "bg-indigo-50",
                color: "#4f46e5",
                icon: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>,
                title: "On-chain transparency",
                desc: "Every USDC/USDT movement is a verifiable on-chain transaction. Full audit trail, always.",
              },
              {
                bg: "bg-violet-50",
                color: "#7c3aed",
                icon: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
                title: "Non-custodial wallet",
                desc: "Your embedded wallet is yours alone. Powered by Privy — only you can authorise transactions.",
              },
            ].map((s) => (
              <div key={s.title} className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${s.bg}`} style={{ color: s.color }}>
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
      <section className="py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="overflow-hidden rounded-3xl bg-blue-600 px-6 py-12 sm:px-8 sm:py-16 shadow-xl shadow-blue-100">
            {/* Subtle dot overlay */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.04]"
              style={{ backgroundImage: "radial-gradient(white 1px, transparent 1px)", backgroundSize: "24px 24px" }}
            />
            <div className="relative">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-widest text-white/80">Live now</span>
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight tracking-[-0.03em] text-white">
                Start receiving crypto<br />as naira today
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-blue-100 max-w-2xl mx-auto">
                Deposit USDC or USDT from any chain. XPay converts it and pays out naira to any Nigerian bank — in seconds.
              </p>
              {!isLoggedIn ? (
                <Link
                  to="/onboarding"
                  className="mt-8 inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-2xl bg-white px-10 py-4 text-lg font-bold text-blue-600 shadow-lg shadow-blue-900/10 transition hover:bg-blue-50 active:scale-[.98]"
                >
                  Create free account
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </Link>
              ) : (
                <Link
                  to="/home"
                  className="mt-8 inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-2xl bg-white px-10 py-4 text-lg font-bold text-blue-600 shadow-lg shadow-blue-900/10 transition hover:bg-blue-50 active:scale-[.98]"
                >
                  Go to Dashboard
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </Link>
              )}
              <p className="mt-6 text-sm text-white/40">Free to sign up · No crypto knowledge required</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 bg-white py-14">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <img src={xpayLogo} alt="XPay" className="mb-3 h-8 w-auto object-contain" />
              <p className="text-sm leading-relaxed text-gray-500">
                Receive USDC &amp; USDT.<br />
                Convert to naira instantly.
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                All systems operational
              </div>
            </div>
            {[
              { heading: "Product",  items: ["How it works", "Networks", "Features", "Security"] },
              { heading: "Company",  items: ["About", "Contact", "Blog"] },
              { heading: "Legal",    items: ["Privacy", "Terms", "Cookies"] },
            ].map((col) => (
              <div key={col.heading}>
                <p className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">{col.heading}</p>
                <ul className="space-y-2.5">
                  {col.items.map((item) => (
                    <li key={item}>
                      <span className="cursor-pointer text-sm text-gray-500 transition hover:text-gray-900">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-gray-100 pt-8 sm:flex-row sm:items-center">
            <p className="text-xs text-gray-400">© 2026 XPay. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-2">
              {["Ethereum", "Base", "Tron", "Polygon", "BNB Chain", "Solana"].map((n) => (
                <span key={n} className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1 text-[10px] font-semibold text-gray-400">
                  {n}
                </span>
              ))}
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}

import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "@/lib/session";
import xpayLogo from "@/assets/xpay_logo.png";

// ── Types ─────────────────────────────────────────────────────────────────────
type ToggleOption = "receive" | "convert";

// ── Smooth-scroll helper ──────────────────────────────────────────────────────
function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Nav links — single source of truth ───────────────────────────────────────
const NAV_LINKS = [
  { label: "How it works", id: "how-it-works" },
  { label: "Why XPay",     id: "why-xpay"     },
  { label: "Security",     id: "security"      },
] as const;

// ── Segmented Toggle Bar ──────────────────────────────────────────────────────
function ToggleBar({
  active,
  onChange,
}: {
  active: ToggleOption;
  onChange: (v: ToggleOption) => void;
}) {
  return (
    <div className="relative inline-flex w-full max-w-xs rounded-2xl border border-white/[0.08] bg-white/[0.04] p-1">
      <span
        className="pointer-events-none absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-emerald-500/90 transition-all duration-300 ease-in-out"
        style={{ left: active === "receive" ? "4px" : "calc(50%)" }}
      />
      {(["receive", "convert"] as ToggleOption[]).map((val) => {
        const label = val === "receive" ? "Receive Crypto" : "Convert to Naira";
        const isActive = active === val;
        return (
          <button
            key={val}
            onClick={() => onChange(val)}
            className={`relative z-10 flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition-colors duration-200 ${
              isActive ? "text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Phase 2: Receive panel ────────────────────────────────────────────────────
// Verified claims:
//   - XPay-to-XPay: @username or phone (backend/dist/services/accounts.js resolveRecipient)
//   - External senders: wallet address on Base network only (NetworkContext.tsx DEFAULT_CHAIN=Base,
//     backend/dist/chain/baseSepolia.js, backend/dist/config.js BASE_CHAIN_ID=84532)
//   - USDC only — no USDT anywhere in the codebase
// Removed: "Sender needs no XPay account" — false for @username/phone path (sender must be XPay user)
function ReceivePanel() {
  return (
    <div className="mt-6 w-full max-w-xs">
      <div className="rounded-2xl border border-white/[0.07] bg-[#1a1a1c] p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2v14M6 10l6 6 6-6" /><path d="M3 20h18" />
            </svg>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-white">Receive USDC</p>
            <p className="text-[12px] text-white/40">On Base network</p>
          </div>
        </div>

        {/* XPay-to-XPay path */}
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-white/25">
            From another XPay user
          </p>
          <div className="space-y-2 text-[13px] text-white/50">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              Share your @username or phone number
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              They send USDC directly to your handle
            </div>
          </div>
        </div>

        {/* External wallet path */}
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-white/25">
            From an external wallet
          </p>
          <div className="space-y-2 text-[13px] text-white/50">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/20" />
              Share your Base network wallet address
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/20" />
              Send USDC on Base only — other networks not supported
            </div>
          </div>
        </div>

        <Link
          to="/onboarding"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-emerald-400"
        >
          Get your handle
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M4 10h12M12 6l4 4-4 4" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

// ── Phase 2: Convert panel ────────────────────────────────────────────────────
// Verified claims:
//   - Convert is bank-only: flow = amount → bank_account → bank_confirm → review → pin
//     (convert.tsx Step type, sendToBank API)
//   - Account name verified via Paystack before confirm (api/index.ts resolveBankAccount)
//   - "Current NGN rate shown" — rate fetched from live FX API, cached ≤1 min server-side,
//     quote valid 5 min (backend/dist/providers/fx/RealFXProvider.js, config.js QUOTE_TTL_SECONDS=300)
// Removed: "Pay by @username or phone" — not part of Convert flow
// Removed: "funds in under 60s" — no SLA in code; Paystack payout starts as "pending"
function ConvertPanel() {
  return (
    <div className="mt-6 w-full max-w-xs">
      <div className="rounded-2xl border border-white/[0.07] bg-[#1a1a1c] p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round">
              <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4" />
            </svg>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-white">Convert USDC to Naira</p>
            <p className="text-[12px] text-white/40">Paid to your Nigerian bank account</p>
          </div>
        </div>
        <div className="space-y-2 text-[13px] text-white/50">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
            Enter your bank name and 10-digit account number
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
            Account name verified before you confirm
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
            Current NGN rate shown before you confirm
          </div>
        </div>
        <Link
          to="/onboarding"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-blue-400"
        >
          Start converting
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M4 10h12M12 6l4 4-4 4" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

// ── Phone mockup ──────────────────────────────────────────────────────────────
function PhoneMockup() {
  return (
    <div className="mx-auto w-[200px] sm:w-[220px] overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#1a1a1c] shadow-2xl shadow-black/60">
      <div className="flex justify-center pt-3 pb-1">
        <div className="h-1.5 w-16 rounded-full bg-white/10" />
      </div>
      <div className="px-4 pb-6 pt-3 space-y-4">
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-widest">Portfolio</p>
          <p className="mt-1 text-[26px] font-bold text-white leading-none">$4,820.41</p>
          <p className="mt-1 text-[11px] text-white/40">USDC · Base</p>
        </div>
        <div className="space-y-2 rounded-2xl border border-white/[0.07] bg-[#111113] p-3">
          <div className="flex items-center gap-2.5">
            <div
              className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ backgroundColor: "#2775CA33", color: "#2775CA" }}
            >
              U
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-white/80">USDC</p>
              <p className="text-[10px] text-white/30">Stablecoin · Base</p>
            </div>
            <p className="text-[11px] font-semibold text-white/70 tabular-nums">$4,820.41</p>
          </div>
        </div>
        <div className="flex justify-between gap-1.5">
          {(["Receive", "Convert", "Send", "Swap"] as const).map((a, i) => (
            <div key={a} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  i === 0 ? "bg-emerald-500" : i === 1 ? "bg-blue-500" : "bg-white/[0.07]"
                }`}
              >
                <div className="h-2 w-2 rounded-full bg-white/60" />
              </div>
              <p className="text-[9px] text-white/30">{a}</p>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <p className="text-[9px] uppercase tracking-widest text-white/25">Activity</p>
          {[
            { name: "@tunde · Bank payout", amt: "₦185,400", out: true  },
            { name: "Received from @ada",   amt: "+$500.00",  out: false },
          ].map((tx) => (
            <div key={tx.name} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-2">
              <div className="h-6 w-6 shrink-0 rounded-full bg-white/10" />
              <p className="flex-1 text-[10px] text-white/60 truncate">{tx.name}</p>
              <p className={`text-[10px] font-semibold tabular-nums ${tx.out ? "text-white/60" : "text-emerald-400"}`}>
                {tx.amt}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#1a1a1c] p-5">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.07]">
        {icon}
      </div>
      <p className="text-[15px] font-semibold text-white/90">{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-white/40">{desc}</p>
    </div>
  );
}

// ── Main Landing Page ─────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate();
  const { authUser, profile, loading } = useSession();
  const [activeToggle, setActiveToggle] = useState<ToggleOption>("receive");

  // Phase 4: mobile menu
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Phase 4: active section for nav highlight
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    // Don't auto-redirect — logged-in users can still visit the landing page
  }, []);

  // Close mobile menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close mobile menu on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Highlight nav link for the section currently in view
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    NAV_LINKS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { rootMargin: "-56px 0px -55% 0px", threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  // All feature claims verified against code (see Phase 1 table)
  const features = [
    {
      title: "Bank payout via Paystack",
      desc: "Sell USDC and receive naira directly to any Nigerian bank account. Powered by Paystack Transfers.",
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.75" strokeLinecap="round">
          <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4" />
        </svg>
      ),
    },
    {
      title: "Account name verified",
      desc: "Bank name and account number are resolved via Paystack before you confirm. No wrong transfers.",
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.75" strokeLinecap="round">
          <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      ),
    },
    {
      title: "Current NGN rate",
      desc: "The exchange rate is fetched from a live FX API before every quote. You see the exact naira amount before confirming.",
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.75" strokeLinecap="round">
          <path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 4-4" />
        </svg>
      ),
    },
    {
      title: "Pay by @username or phone",
      desc: "XPay-to-XPay transfers use your @username or 10-digit phone number. No bank details needed.",
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.75" strokeLinecap="round">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
    {
      title: "PIN-protected",
      desc: "Every conversion requires your 4-digit PIN. Hashed with argon2id — never stored in plain text.",
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.75" strokeLinecap="round">
          <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      ),
    },
    {
      title: "On-chain transparency",
      desc: "Every USDC transfer is a verifiable transaction on Base. The blockchain is your receipt.",
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.75" strokeLinecap="round">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
        </svg>
      ),
    },
  ];

  const steps = [
    {
      title: "Create your account",
      desc: "Sign up with your email. You get an @username, a 10-digit phone-linked address, and a USDC wallet on Base.",
    },
    {
      title: "Share your handle or address",
      desc: "Give XPay users your @username or phone number. For external wallets, share your Base network address.",
    },
    {
      title: "USDC lands in your wallet",
      desc: "Once USDC is sent to your address on Base, it appears in your XPay balance after blockchain confirmation.",
    },
    {
      title: "Convert to naira",
      desc: "Enter your bank account number. See the current NGN rate. Confirm with your PIN. Naira is sent via Paystack.",
    },
  ];

  return (
    <div className="min-h-dvh bg-[#111113] text-white overflow-x-hidden">

      {/* ── Phase 4: Navbar ──────────────────────────────────────────────────── */}
      <nav
        ref={menuRef}
        className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[#111113]/95 backdrop-blur-xl"
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-5">

          {/* Logo */}
          <img
            src={xpayLogo}
            alt="XPay"
            className="h-7 w-auto object-contain brightness-0 invert opacity-90"
          />

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-0.5">
            {NAV_LINKS.map(({ label, id }) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  activeSection === id
                    ? "bg-white/[0.07] text-white"
                    : "text-white/40 hover:bg-white/[0.04] hover:text-white/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Right: CTA buttons + mobile hamburger */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/login"
              className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 py-2 text-[13px] font-semibold text-white/70 transition hover:border-white/20 hover:text-white sm:px-4 sm:text-[14px]"
            >
              Sign In
            </Link>
            <Link
              to="/onboarding"
              className="rounded-xl bg-emerald-500 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-400 sm:px-4 sm:text-[14px]"
            >
              Get Started
            </Link>

            {/* Mobile hamburger — hidden on md+ */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="ml-1 flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] transition hover:bg-white/[0.08] md:hidden"
            >
              {menuOpen ? (
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round">
                  <path d="M2 4h12M2 8h12M2 12h12" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="border-t border-white/[0.06] bg-[#111113] px-4 py-2 md:hidden">
            {NAV_LINKS.map(({ label, id }) => (
              <button
                key={id}
                onClick={() => { scrollTo(id); setMenuOpen(false); }}
                className={`flex w-full items-center rounded-xl px-4 py-3 text-left text-[14px] font-medium transition-colors ${
                  activeSection === id
                    ? "bg-white/[0.07] text-white"
                    : "text-white/50 hover:bg-white/[0.04] hover:text-white/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="px-4 pt-24 pb-16 sm:px-5 sm:pt-28 sm:pb-20">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col items-center text-center lg:flex-row lg:items-center lg:gap-16 lg:text-left">

            {/* Left: headline + toggle */}
            <div className="flex-1">
              <h1 className="text-[38px] font-bold leading-[1.08] tracking-tight text-white sm:text-[48px] lg:text-[58px]">
                Receive crypto.<br />
                Convert to naira.<br />
                <span className="italic text-emerald-400">Instantly.</span>
              </h1>

              <p className="mx-auto mt-5 max-w-sm text-[15px] leading-relaxed text-white/50 sm:text-[16px] lg:mx-0">
                They don't even need an XPay account.
              </p>

              {/* Toggle + panels — Phase 3: no CTA row below this */}
              <div className="mt-8 flex flex-col items-center lg:items-start">
                <ToggleBar active={activeToggle} onChange={setActiveToggle} />
                {activeToggle === "receive" ? <ReceivePanel /> : <ConvertPanel />}
              </div>
              {/* Phase 3: "Get Started" + "Sign In" buttons removed from here */}
            </div>

            {/* Right: phone mockup */}
            <div className="mt-14 shrink-0 lg:mt-0">
              <PhoneMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────────────── */}
      <section className="border-t border-white/[0.06] px-4 py-14 sm:px-5 sm:py-16">
        <div className="mx-auto max-w-5xl grid grid-cols-3 gap-4 text-center sm:gap-6">
          {[
            { val: "4",    label: "Supported networks" },
            { val: "200+", label: "Nigerian banks via Paystack" },
            { val: "USDC", label: "Supported asset" },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-[26px] font-bold text-emerald-400 sm:text-[32px] lg:text-[40px]">{s.val}</p>
              <p className="mt-1 text-[12px] text-white/40 sm:text-[13px]">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── id="how-it-works" ── scroll-mt-14 clears sticky nav */}
      <section
        id="how-it-works"
        className="border-t border-white/[0.06] px-4 py-16 scroll-mt-14 sm:px-5 sm:py-20"
      >
        <div className="mx-auto max-w-5xl">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-widest text-white/30">How it works</p>
          <h2 className="text-[28px] font-bold leading-tight tracking-tight text-white sm:text-[32px] lg:text-[40px]">
            From crypto to naira<br />
            <span className="italic text-white/40">in four steps.</span>
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-white/[0.07] bg-[#1a1a1c] p-5">
                <div className="mb-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-400">
                    {i + 1}
                  </span>
                </div>
                <p className="text-[15px] font-semibold text-white/90">{s.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/40">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why XPay ── id="why-xpay" (renamed from id="features") ─────────── */}
      <section
        id="why-xpay"
        className="border-t border-white/[0.06] px-4 py-16 scroll-mt-14 sm:px-5 sm:py-20"
      >
        <div className="mx-auto max-w-5xl">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-widest text-white/30">Why XPay</p>
          <h2 className="text-[28px] font-bold leading-tight tracking-tight text-white sm:text-[32px] lg:text-[40px]">
            Built for how money<br />
            <span className="italic text-white/40">really moves.</span>
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/40">
            They don't even need an XPay account.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => <FeatureCard key={f.title} {...f} />)}
          </div>
        </div>
      </section>

      {/* ── Security ── id="security" ────────────────────────────────────────── */}
      <section
        id="security"
        className="border-t border-white/[0.06] px-4 py-16 scroll-mt-14 sm:px-5 sm:py-20"
      >
        <div className="mx-auto max-w-5xl">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-widest text-white/30">Security</p>
          <h2 className="text-[28px] font-bold leading-tight tracking-tight text-white sm:text-[32px] lg:text-[40px]">
            PIN-gated transfers.
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/40">
            Every conversion and payout requires your 4-digit PIN. Hashed with argon2id, rate-limited to 5 attempts — never stored in plain text.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                title: "PIN-gated transfers",
                desc: "Every conversion requires your PIN. 5 wrong attempts trigger a 15-minute lockout.",
              },
              {
                title: "On-chain transparency",
                desc: "Every USDC transfer is a verifiable on-chain transaction on Base. Full audit trail.",
              },
              {
                title: "Bank account verified",
                desc: "Account name resolved via Paystack before any naira is sent. You see who you're paying.",
              },
            ].map((s) => (
              <div key={s.title} className="rounded-2xl border border-white/[0.07] bg-[#1a1a1c] p-5">
                <p className="text-[15px] font-semibold text-white/90">{s.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/40">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA — no buttons (Phase 3) ───────────────────────────────── */}
      <section className="border-t border-white/[0.06] px-4 py-20 sm:px-5 sm:py-24">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-[28px] font-bold leading-tight tracking-tight text-white sm:text-[32px] lg:text-[40px]">
            More than somewhere<br />to keep money.<br />
            <span className="italic text-emerald-400">Somewhere to move it.</span>
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-white/40">
            Receive USDC on Base. Convert to naira. Sent to any Nigerian bank account.
          </p>
        </div>
      </section>

      {/* ── Phase 4: Footer with nav links ──────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] px-4 py-10 sm:px-5">
        <div className="mx-auto max-w-5xl">
          {/* Top row */}
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
            <img
              src={xpayLogo}
              alt="XPay"
              className="h-6 w-auto object-contain brightness-0 invert opacity-55"
            />
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 sm:justify-end">
              {NAV_LINKS.map(({ label, id }) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className="text-[13px] text-white/35 transition hover:text-white/70"
                >
                  {label}
                </button>
              ))}
              <Link to="/login"     className="text-[13px] text-white/35 transition hover:text-white/70">Sign in</Link>
              <Link to="/onboarding" className="text-[13px] text-white/35 transition hover:text-white/70">Get started</Link>
            </div>
          </div>
          {/* Bottom row */}
          <div className="mt-6 border-t border-white/[0.06] pt-6 text-center sm:text-left">
            <p className="text-[12px] text-white/20">© {new Date().getFullYear()} XPay. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

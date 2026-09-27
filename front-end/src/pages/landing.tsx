import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import xpayLogo from "@/assets/xpay_logo.png";

// ── Smooth-scroll helper ──────────────────────────────────────────────────────
function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Nav links ─────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { label: "How it works", id: "how-it-works" },
  { label: "Why XPay",     id: "why-xpay"     },
  { label: "Security",     id: "security"      },
] as const;

// ── Simple product visual ─────────────────────────────────────────────────────
function ProductVisual() {
  return (
    <div className="relative mx-auto w-[240px] sm:w-[260px]">
      {/* Subtle glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 rounded-[2rem] bg-emerald-500/10 blur-3xl" />

      <div className="overflow-hidden rounded-[2rem] border border-white/[0.09] bg-[#1a1a1c] shadow-2xl shadow-black/60">
        {/* Pill notch */}
        <div className="flex justify-center pt-3 pb-0">
          <div className="h-1 w-12 rounded-full bg-white/10" />
        </div>

        {/* Received state */}
        <div className="px-6 py-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-white/25">
              XPay
            </span>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold text-emerald-400">
              Live
            </span>
          </div>

          {/* Amount received */}
          <div className="text-center space-y-1">
            <p className="text-[11px] text-white/30 uppercase tracking-widest">Received</p>
            <p className="text-[36px] font-bold text-white leading-none tabular-nums">$500</p>
            <p className="text-[13px] text-white/40">USDC · Base</p>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06]">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2v12M3 9l5 5 5-5" />
              </svg>
            </div>
          </div>

          {/* Converted amount */}
          <div className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3 text-center">
            <p className="text-[11px] text-white/30 uppercase tracking-widest">Converted to Naira</p>
            <p className="mt-1 text-[22px] font-bold text-emerald-400 leading-none tabular-nums">
              ₦740,000
            </p>
          </div>

          {/* To bank */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
              <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.75" strokeLinecap="round">
                <path d="M4 10v5m4-5v5m4-5v5M2 15h16M2 8h16M10 2l8 6H2l8-6z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-white/60">GTBank · 0123456789</p>
              <p className="text-[10px] text-white/30">Naira sent ✓</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Landing Page ─────────────────────────────────────────────────────────
export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close menu on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Highlight active nav section
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

  return (
    <div className="min-h-dvh bg-[#111113] text-white overflow-x-hidden">

      {/* ── Navbar ── */}
      <nav
        ref={menuRef}
        className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[#111113]/95 backdrop-blur-xl"
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-5">

          {/* Logo */}
          <img src={xpayLogo} alt="XPay" className="h-7 w-auto object-contain brightness-0 invert opacity-90" />

          {/* Desktop nav */}
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

          {/* Right: CTA + hamburger */}
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden sm:inline-flex rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[13px] font-semibold text-white/70 transition hover:border-white/20 hover:text-white"
            >
              Sign In
            </Link>
            <Link
              to="/onboarding"
              className="rounded-xl bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-400"
            >
              Get Started
            </Link>

            {/* Mobile hamburger */}
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
            <div className="mt-1 border-t border-white/[0.06] pt-2 pb-1">
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center rounded-xl px-4 py-3 text-left text-[14px] font-medium text-white/50 transition-colors hover:bg-white/[0.04] hover:text-white/80"
              >
                Sign In
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <section className="px-4 pt-28 pb-20 sm:px-5 sm:pt-32 sm:pb-24">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col items-center gap-12 text-center lg:flex-row lg:items-center lg:justify-between lg:gap-16 lg:text-left">

            {/* Left: copy + CTAs */}
            <div className="flex-1 max-w-xl">
              <h1 className="text-[40px] font-bold leading-[1.06] tracking-tight text-white sm:text-[52px] lg:text-[62px]">
                Receive crypto.<br />
                Convert to naira.<br />
                <span className="italic text-emerald-400">Instantly.</span>
              </h1>

              <p className="mt-5 text-[16px] leading-relaxed text-white/45 sm:text-[17px]">
                They don't even need an XPay account.
              </p>
            </div>

            {/* Right: product visual */}
            <div className="shrink-0">
              <ProductVisual />
            </div>
          </div>
        </div>
      </section>

      {/* ── What XPay does strip ── */}
      <section className="border-t border-white/[0.06] px-4 py-14 sm:px-5 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:justify-center sm:gap-0">

            {/* Step 1 */}
            <div className="flex flex-col items-center text-center sm:flex-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 10H3M7 15l-5-5 5-5" />
                </svg>
              </div>
              <p className="mt-3 text-[14px] font-semibold text-white/80">Receive USDC</p>
              <p className="mt-1 text-[12px] text-white/35 max-w-[120px]">Via username, phone, or wallet</p>
            </div>

            {/* Arrow */}
            <div className="hidden sm:flex items-center justify-center px-3 text-white/20">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 10h12M12 6l4 4-4 4" /></svg>
            </div>
            <div className="flex sm:hidden text-white/20">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 4v12M6 12l4 4 4-4" /></svg>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center sm:flex-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7h14M7 3l-4 4 4 4M17 13H3M13 9l4 4-4 4" />
                </svg>
              </div>
              <p className="mt-3 text-[14px] font-semibold text-white/80">Convert to Naira</p>
              <p className="mt-1 text-[12px] text-white/35 max-w-[120px]">Live rate, confirmed before you commit</p>
            </div>

            {/* Arrow */}
            <div className="hidden sm:flex items-center justify-center px-3 text-white/20">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 10h12M12 6l4 4-4 4" /></svg>
            </div>
            <div className="flex sm:hidden text-white/20">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 4v12M6 12l4 4 4-4" /></svg>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center sm:flex-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.07]">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 6v8m4-8v8m4-8v8M2 14h16M2 7h16M10 2l8 5H2l8-5z" />
                </svg>
              </div>
              <p className="mt-3 text-[14px] font-semibold text-white/80">Bank Payout</p>
              <p className="mt-1 text-[12px] text-white/35 max-w-[120px]">Any Nigerian bank via Paystack</p>
            </div>

          </div>
        </div>
      </section>

      {/* ── Why XPay ── */}
      <section
        id="why-xpay"
        className="border-t border-white/[0.06] px-4 py-16 scroll-mt-14 sm:px-5 sm:py-20"
      >
        <div className="mx-auto max-w-5xl">
          <p className="text-[12px] font-bold uppercase tracking-widest text-white/25">Why XPay</p>
          <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-white sm:text-[34px]">
            Built for how money<br />
            <span className="italic text-white/35">really moves.</span>
          </h2>

          <div className="mt-10 grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3 overflow-hidden rounded-2xl border border-white/[0.07]">
            {[
              {
                title: "No wallet address needed",
                desc: "XPay-to-XPay transfers use your @username or phone number. No crypto knowledge required from the sender.",
              },
              {
                title: "Any Nigerian bank",
                desc: "Convert USDC and withdraw naira directly to 200+ Nigerian banks via Paystack Transfers.",
              },
              {
                title: "Account name verified",
                desc: "Bank account name is resolved via Paystack before you confirm. No wrong transfers.",
              },
              {
                title: "Live NGN rate",
                desc: "The exchange rate is fetched before every quote. You see the exact naira amount before confirming.",
              },
              {
                title: "PIN-protected",
                desc: "Every conversion requires your 4-digit PIN. Hashed with argon2id — never stored in plain text.",
              },
              {
                title: "On-chain transparency",
                desc: "Every USDC transfer is a verifiable transaction on Base. The blockchain is your receipt.",
              },
            ].map((f) => (
              <div key={f.title} className="bg-[#1a1a1c] px-5 py-5">
                <p className="text-[14px] font-semibold text-white/85">{f.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/35">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section
        id="how-it-works"
        className="border-t border-white/[0.06] px-4 py-16 scroll-mt-14 sm:px-5 sm:py-20"
      >
        <div className="mx-auto max-w-5xl">
          <p className="text-[12px] font-bold uppercase tracking-widest text-white/25">How it works</p>
          <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-white sm:text-[34px]">
            From crypto to naira<br />
            <span className="italic text-white/35">in four steps.</span>
          </h2>

          <div className="mt-10 space-y-0 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.07]">

            {/* Step 01 — Receive */}
            <div className="bg-[#1a1a1c] px-6 py-6 sm:px-8">
              <div className="flex items-start gap-5">
                <span className="shrink-0 text-[11px] font-bold tabular-nums text-white/20 pt-0.5">01</span>
                <div className="flex-1">
                  <p className="text-[16px] font-semibold text-white/90">Receive</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-white/40">
                    Get paid in USDC on Base network. Share your @username or phone number with another XPay user — no wallet address required. For external wallets, share your Base wallet address.
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-white/25 mb-2">From another XPay user</p>
                      <p className="text-[12px] text-white/45 leading-relaxed">Share your @username or phone number. They send USDC directly to your handle.</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-white/25 mb-2">From an external wallet</p>
                      <p className="text-[12px] text-white/45 leading-relaxed">Share your Base network wallet address. Send USDC on Base — other networks not supported.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 02 — Send */}
            <div className="bg-[#1a1a1c] px-6 py-6 sm:px-8">
              <div className="flex items-start gap-5">
                <span className="shrink-0 text-[11px] font-bold tabular-nums text-white/20 pt-0.5">02</span>
                <div className="flex-1">
                  <p className="text-[16px] font-semibold text-white/90">Send</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-white/40">
                    Send USDC to any other XPay user using their @username or phone number. No need to handle wallet addresses. Confirm with your PIN.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 03 — Convert */}
            <div className="bg-[#1a1a1c] px-6 py-6 sm:px-8">
              <div className="flex items-start gap-5">
                <span className="shrink-0 text-[11px] font-bold tabular-nums text-white/20 pt-0.5">03</span>
                <div className="flex-1">
                  <p className="text-[16px] font-semibold text-white/90">Convert</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-white/40">
                    Convert your USDC to Nigerian naira at the current live rate. The exact NGN amount is shown before you confirm — no surprises.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 04 — Withdraw */}
            <div className="bg-[#1a1a1c] px-6 py-6 sm:px-8">
              <div className="flex items-start gap-5">
                <span className="shrink-0 text-[11px] font-bold tabular-nums text-white/20 pt-0.5">04</span>
                <div className="flex-1">
                  <p className="text-[16px] font-semibold text-white/90">Withdraw</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-white/40">
                    Enter your bank name and 10-digit account number. Account name is verified via Paystack before any naira is sent. Works with 200+ Nigerian banks.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Security ── */}
      <section
        id="security"
        className="border-t border-white/[0.06] px-4 py-16 scroll-mt-14 sm:px-5 sm:py-20"
      >
        <div className="mx-auto max-w-5xl">
          <p className="text-[12px] font-bold uppercase tracking-widest text-white/25">Security</p>
          <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-white sm:text-[34px]">
            PIN-gated transfers.
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/40">
            Every conversion and payout requires your 4-digit PIN. Hashed with argon2id, rate-limited to 5 attempts — never stored in plain text.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-px sm:grid-cols-3 overflow-hidden rounded-2xl border border-white/[0.07]">
            {[
              {
                title: "PIN-gated",
                desc: "Every conversion requires your PIN. 5 wrong attempts trigger a 15-minute lockout.",
              },
              {
                title: "On-chain",
                desc: "Every USDC transfer is a verifiable on-chain transaction on Base. Full audit trail.",
              },
              {
                title: "Verified payouts",
                desc: "Bank account name is resolved via Paystack before naira is sent. You see who you're paying.",
              },
            ].map((s) => (
              <div key={s.title} className="bg-[#1a1a1c] px-5 py-5">
                <p className="text-[14px] font-semibold text-white/85">{s.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/35">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="border-t border-white/[0.06] px-4 py-20 sm:px-5 sm:py-28">
        <div className="mx-auto max-w-lg text-center">
          <h2 className="text-[28px] font-bold leading-tight tracking-tight text-white sm:text-[36px]">
            Ready to receive?
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/40">
            Receive USDC on Base. Convert to naira. Sent to any Nigerian bank account.
          </p>
          <Link
            to="/onboarding"
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-8 py-3.5 text-[14px] font-semibold text-white transition hover:bg-emerald-400"
          >
            Get Started
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M4 10h12M12 6l4 4-4 4" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] px-4 py-10 sm:px-5">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
            <img
              src={xpayLogo}
              alt="XPay"
              className="h-6 w-auto object-contain brightness-0 invert opacity-50"
            />
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 sm:justify-end">
              {NAV_LINKS.map(({ label, id }) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className="text-[13px] text-white/30 transition hover:text-white/60"
                >
                  {label}
                </button>
              ))}
              <Link to="/login"      className="text-[13px] text-white/30 transition hover:text-white/60">Sign in</Link>
              <Link to="/onboarding" className="text-[13px] text-white/30 transition hover:text-white/60">Get started</Link>
            </div>
          </div>
          <div className="mt-6 border-t border-white/[0.05] pt-6 text-center sm:text-left">
            <p className="text-[12px] text-white/20">© {new Date().getFullYear()} XPay. All rights reserved.</p>
          </div>
        </div>
      </footer>

    </div>
  );
}

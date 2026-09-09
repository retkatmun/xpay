"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { PhoneMockup } from "@/components/PhoneMockup";

export default function Landing() {
  const { user, loading } = useSession();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/home");
  }, [loading, user, router]);

  if (loading || user) return <div className="min-h-dvh bg-white" />;

  return (
    <div className="min-h-dvh bg-white font-[var(--font-public-sans)] text-gray-900">

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="font-[var(--font-instrument-serif)] text-2xl text-blue-600">XPay</span>

          {/* desktop links */}
          <div className="hidden items-center gap-8 md:flex">
            <a href="#how-it-works" className="text-sm text-gray-500 transition hover:text-gray-900">How it works</a>
            <a href="#features"     className="text-sm text-gray-500 transition hover:text-gray-900">Features</a>
            <a href="#security"     className="text-sm text-gray-500 transition hover:text-gray-900">Security</a>
          </div>

          <div className="flex items-center gap-3">
            <a href="/login" className="hidden rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 md:block">
              Log in
            </a>
            <a href="/phone" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
              Get started
            </a>
            {/* mobile menu button */}
            <button
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 md:hidden"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu"
            >
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                {menuOpen
                  ? <><path d="M4 4l12 12M16 4L4 16" /></>
                  : <><path d="M3 5h14M3 10h14M3 15h14" /></>}
              </svg>
            </button>
          </div>
        </div>

        {/* mobile nav */}
        {menuOpen && (
          <div className="border-t border-gray-100 bg-white px-6 pb-4 md:hidden">
            <div className="flex flex-col gap-1 pt-3">
              {[["#how-it-works","How it works"],["#features","Features"],["#security","Security"]].map(([href, label]) => (
                <a key={href} href={href} onClick={() => setMenuOpen(false)}
                   className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  {label}
                </a>
              ))}
              <a href="/login" className="mt-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Log in
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-white">
        {/* subtle background dot grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: "radial-gradient(circle, #2563eb 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        {/* blue radial glow right side */}
        <div
          className="pointer-events-none absolute right-0 top-0 h-[600px] w-[600px] -translate-y-20 translate-x-32 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #2563eb 0%, transparent 70%)" }}
        />

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-16 md:grid-cols-2 md:py-24">
          {/* left */}
          <div className="max-w-lg">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-[fx-pulse_1.5s_ease-in-out_infinite]" />
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Now live — Base Sepolia</span>
            </div>

            <h1 className="font-[var(--font-instrument-serif)] text-[3.25rem] leading-[1.07] tracking-[-0.025em] text-gray-900 sm:text-[3.75rem]">
              Send dollars.<br />
              <span className="italic text-blue-600">Receive naira.</span><br />
              No P2P.
            </h1>

            <p className="mt-6 text-[1.05rem] leading-relaxed text-gray-500">
              Move money across borders without the complexity. Send USDC to any Nigerian
              phone number, username, or verified bank account — instantly.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/phone"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-[0.95rem] font-semibold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 active:scale-[.98]">
                Get started — it&apos;s free
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8h10M9 4l4 4-4 4"/>
                </svg>
              </a>
              <a href="#how-it-works"
                className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-7 py-3.5 text-[0.95rem] font-medium text-gray-700 transition hover:bg-gray-50 hover:border-gray-300">
                See how it works
              </a>
            </div>

            <p className="mt-4 text-sm text-gray-400">Takes about a minute. Just your phone number.</p>

            {/* stats */}
            <div className="mt-10 flex gap-6 border-t border-gray-100 pt-8">
              {[["0%","Platform fee"],["USDC","Stablecoin"],["Base","Fast L2"]].map(([v,l]) => (
                <div key={l}>
                  <p className="font-[var(--font-instrument-serif)] text-xl text-gray-900">{v}</p>
                  <p className="text-xs text-gray-400">{l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* right — phone */}
          <div className="flex justify-center md:justify-end">
            <PhoneMockup className="w-full max-w-[300px]" />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="border-t border-gray-100 bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="font-[var(--font-instrument-serif)] text-[2.25rem] text-gray-900">
              Everything you need to send
            </h2>
            <p className="mt-3 text-gray-500">Built for reliability, not complexity.</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: "⚡", title: "Fast transfers", desc: "Payments clear in seconds, not days. No intermediaries slowing things down." },
              { icon: "✅", title: "Real bank verification", desc: "Account names are verified before you send. No wrong-account mistakes." },
              { icon: "📊", title: "Transparent rates", desc: "See your exact exchange rate and fee before you confirm — no surprises." },
              { icon: "🔒", title: "Secure by design", desc: "PIN-protected transfers, Argon2id hashing, rate-limited to prevent brute force." },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <span className="mb-4 block text-2xl">{f.icon}</span>
                <h3 className="font-semibold text-gray-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="font-[var(--font-instrument-serif)] text-[2.25rem] text-gray-900">
              How it works
            </h2>
            <p className="mt-3 text-gray-500">Four steps. No crypto knowledge required.</p>
          </div>

          <div className="relative">
            {/* connector line (desktop) */}
            <div className="absolute top-7 left-[calc(12.5%+20px)] right-[calc(12.5%+20px)] hidden h-px bg-gray-200 lg:block" />

            <div className="grid gap-8 lg:grid-cols-4">
              {[
                { n:"01", title:"Choose recipient",   desc:"Enter an XPay handle, phone number, or any Nigerian bank account." },
                { n:"02", title:"Verify details",      desc:"We verify the account name before you commit to anything." },
                { n:"03", title:"Review your rate",    desc:"See the live exchange rate, fee, and NGN amount — all upfront." },
                { n:"04", title:"Confirm and send",    desc:"Authorise with your PIN. Done." },
              ].map((s) => (
                <div key={s.n} className="relative flex flex-col items-start lg:items-center lg:text-center">
                  <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-gray-100 bg-white shadow-sm">
                    <span className="font-[var(--font-instrument-serif)] text-xl text-blue-600">{s.n}</span>
                  </div>
                  <h3 className="mt-4 font-semibold text-gray-900">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Send types ── */}
      <section className="border-t border-gray-100 bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="font-[var(--font-instrument-serif)] text-[2.25rem] text-gray-900">
              Send to anyone
            </h2>
            <p className="mt-3 text-gray-500">They don&apos;t even need an XPay account.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
                <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Send to an XPay user</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                Type{" "}
                <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[0.78rem] text-gray-700">@scholar</span>
                {" "}or{" "}
                <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[0.78rem] text-gray-700">0803 123 4567</span>
                {" "}— resolved instantly.
              </p>
            </div>

            <div className="rounded-2xl bg-blue-600 p-8 text-white">
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold">Send to any Nigerian bank</h3>
              <p className="mt-2 text-sm leading-relaxed text-blue-100">
                No XPay account needed. Enter the bank and account number, verify the name, confirm. We settle in naira directly.
              </p>
              <div className="mt-5 rounded-xl border border-white/20 bg-white/10 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-widest text-white/50">Example</p>
                <p className="mt-1.5 text-sm font-semibold">SCHOLAR GAMALIEL</p>
                <p className="text-xs text-white/60">Access Bank · ****6789</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Security ── */}
      <section id="security" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="font-[var(--font-instrument-serif)] text-[2.25rem] text-gray-900">
              Your money deserves better security
            </h2>
            <p className="mt-3 text-gray-500">Every protection is built into the transaction flow.</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {[
              { title:"4-digit transaction PIN",    desc:"Every transfer requires your PIN. Rate-limited and hashed with Argon2id — never plaintext." },
              { title:"Verified recipients",        desc:"Bank accounts are verified against the bank's records before you can send." },
              { title:"Protected transactions",     desc:"Every transaction is tracked from USDC payment through to NGN bank payout." },
            ].map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-gray-100 p-7">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <span className="font-[var(--font-instrument-serif)] text-lg text-blue-600">{i + 1}</span>
                </div>
                <h3 className="font-semibold text-gray-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-gray-100 bg-blue-600 py-20">
        <div className="mx-auto max-w-xl px-6 text-center">
          <h2 className="font-[var(--font-instrument-serif)] text-[2.5rem] leading-tight text-white">
            Ready to move money differently?
          </h2>
          <p className="mt-4 text-[1.05rem] text-blue-200">
            Create your XPay account in under a minute.
          </p>
          <a href="/phone"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-9 py-4 text-[0.95rem] font-semibold text-blue-600 shadow-xl shadow-blue-900/20 transition hover:bg-blue-50 active:scale-[.98]">
            Get started — it&apos;s free
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 bg-white py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <span className="font-[var(--font-instrument-serif)] text-xl text-blue-600">XPay</span>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">Send dollars. Receive naira. No P2P.</p>
            </div>
            {[
              { heading: "Product",  items: ["How it works", "Features", "Security"] },
              { heading: "Company",  items: ["About", "Contact"] },
              { heading: "Legal",    items: ["Privacy", "Terms"] },
            ].map((col) => (
              <div key={col.heading}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">{col.heading}</p>
                <ul className="space-y-2">
                  {col.items.map((item) => (
                    <li key={item}>
                      <span className="text-sm text-gray-500">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-10 border-t border-gray-100 pt-6">
            <p className="text-xs text-gray-400">© 2026 XPay. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

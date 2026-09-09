"use client";

export function PhoneMockup({ className = "" }: { className?: string }) {
  return (
    <div className={`relative flex justify-center ${className}`}>
      {/* glow behind phone */}
      <div
        className="absolute top-8 left-1/2 -translate-x-1/2 h-[380px] w-[280px] rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, #2563eb 0%, #60a5fa 50%, transparent 80%)" }}
      />

      {/* Phone shell */}
      <div className="float relative w-[245px] select-none">
        {/* outer frame */}
        <div className="relative rounded-[2.8rem] bg-gray-900 p-[3px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.08)]">
          {/* inner bezel */}
          <div className="relative overflow-hidden rounded-[2.5rem] bg-[#0f172a]">
            {/* status bar */}
            <div className="flex items-center justify-between px-6 pt-3 pb-1">
              <span className="text-[10px] font-semibold text-white/60">9:41</span>
              <div className="flex items-center gap-1">
                <svg viewBox="0 0 16 12" width="14" height="10" fill="currentColor" className="text-white/60">
                  <rect x="0"  y="4" width="3" height="8" rx="0.5" />
                  <rect x="4"  y="2.5" width="3" height="9.5" rx="0.5" />
                  <rect x="8"  y="1" width="3" height="11" rx="0.5" />
                  <rect x="12" y="0" width="3" height="12" rx="0.5" opacity="0.35" />
                </svg>
                <svg viewBox="0 0 25 12" width="23" height="11" fill="none" className="text-white/60">
                  <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="currentColor" strokeOpacity="0.4" />
                  <rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" />
                  <path d="M23 4v4a2 2 0 000-4z" fill="currentColor" fillOpacity="0.4" />
                </svg>
              </div>
            </div>

            {/* notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-6 w-20 rounded-b-2xl bg-gray-900" />

            {/* screen content */}
            <div className="px-5 pb-8 pt-2">
              {/* greeting */}
              <p className="text-[10px] font-medium text-white/40 mt-2">Good morning</p>

              {/* balance */}
              <p className="mt-0.5 font-[var(--font-instrument-serif)] text-[2rem] leading-none text-white tracking-[-0.03em]">
                $1,250<span className="text-[1.1rem] text-white/60">.00</span>
              </p>
              <div className="mt-1 flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-blue-400" />
                <p className="text-[9px] font-medium text-white/40 uppercase tracking-widest">USDC · Base</p>
              </div>

              {/* action buttons */}
              <div className="mt-4 flex gap-2">
                <div className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5">
                  <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h10M9 4l4 4-4 4"/>
                  </svg>
                  <span className="text-[10px] font-semibold text-white">Send</span>
                </div>
                <div className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2.5">
                  <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                    <path d="M13 8H3M7 4L3 8l4 4"/>
                  </svg>
                  <span className="text-[10px] font-semibold text-white/70">Receive</span>
                </div>
              </div>

              {/* divider */}
              <div className="mt-5 mb-3 flex items-center justify-between">
                <span className="text-[9px] font-semibold uppercase tracking-widest text-white/30">Recent</span>
              </div>

              {/* transactions */}
              {[
                { name: "John Doe",   sub: "GTBank · ****4521", amt: "-$200", ngn: "₦296,000", out: true },
                { name: "Ada Okafor", sub: "XPay user",          amt: "+$50",  ngn: "₦74,000",  out: false },
              ].map((t) => (
                <div key={t.name} className="flex items-center gap-2.5 py-2 border-t border-white/[0.06]">
                  <div className="h-7 w-7 shrink-0 rounded-full bg-white/10 flex items-center justify-center">
                    <span className="text-[8px] font-bold text-white/60">
                      {t.name.split(" ").map(w => w[0]).join("")}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold text-white/85 truncate">{t.name}</p>
                    <p className="text-[8px] text-white/35 truncate">{t.sub}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-[10px] font-semibold tabular-nums ${t.out ? "text-white/75" : "text-blue-400"}`}>{t.amt}</p>
                    <p className="text-[8px] text-white/30 tabular-nums">{t.ngn}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* home bar */}
            <div className="flex justify-center pb-2">
              <div className="h-1 w-24 rounded-full bg-white/20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

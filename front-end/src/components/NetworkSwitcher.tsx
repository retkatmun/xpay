import { useEffect, useRef, useState } from "react";
import { useNetwork } from "@/lib/NetworkContext";
import type { ChainConfig } from "@/lib/NetworkContext";

/**
 * Network switcher dropdown — shows the active chain and lets the user pick
 * a different one. Changing the network updates balance + transaction history
 * everywhere via NetworkContext.
 */
export function NetworkSwitcher() {
  const { activeChain, setActiveChain, chains } = useNetwork();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.06] px-2.5 py-1 transition hover:border-white/20 hover:bg-white/[0.1]"
      >
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: activeChain.color }}
        />
        <span className="text-[10px] font-bold text-white/70">{activeChain.shortName}</span>
        <svg
          viewBox="0 0 12 12"
          width="8"
          height="8"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-48 overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1a1c] shadow-2xl shadow-black/50">
          {chains.map((chain: ChainConfig) => (
            <button
              key={chain.id}
              onClick={() => {
                setActiveChain(chain);
                setOpen(false);
              }}
              className={[
                "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition hover:bg-white/[0.05]",
                chain.id === activeChain.id
                  ? "bg-white/[0.06] font-semibold text-white/90"
                  : "text-white/60",
              ].join(" ")}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: chain.color }}
              />
              <span className="flex-1">{chain.name}</span>
              {chain.isTestnet && (
                <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-400">
                  test
                </span>
              )}
              {chain.id === activeChain.id && (
                <svg
                  viewBox="0 0 12 12"
                  width="10"
                  height="10"
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 6l3 3 5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

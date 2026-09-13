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
        className="flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 transition hover:bg-blue-100"
      >
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: activeChain.color }}
        />
        <span className="text-[10px] font-bold text-blue-700">{activeChain.shortName}</span>
        <svg
          viewBox="0 0 12 12"
          width="8"
          height="8"
          fill="none"
          stroke="#1d4ed8"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          {chains.map((chain: ChainConfig) => (
            <button
              key={chain.id}
              onClick={() => {
                setActiveChain(chain);
                setOpen(false);
              }}
              className={[
                "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition hover:bg-gray-50",
                chain.id === activeChain.id
                  ? "bg-blue-50 font-semibold text-blue-700"
                  : "text-gray-700",
              ].join(" ")}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: chain.color }}
              />
              <span className="flex-1">{chain.name}</span>
              {chain.isTestnet && (
                <span className="rounded bg-amber-50 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-600">
                  test
                </span>
              )}
              {chain.id === activeChain.id && (
                <svg
                  viewBox="0 0 12 12"
                  width="10"
                  height="10"
                  fill="none"
                  stroke="#2563eb"
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

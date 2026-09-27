import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNetwork } from "@/lib/NetworkContext";
import type { ChainConfig } from "@/lib/NetworkContext";

/**
 * Network switcher — pill trigger, portal-anchored dropdown.
 * The dropdown renders into document.body so no parent overflow:hidden clips it.
 */
export function NetworkSwitcher() {
  const { activeChain, setActiveChain, chains } = useNetwork();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Calculate dropdown position after paint
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
  }, [open]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    function onMouse(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* Trigger pill */}
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.05] px-2.5 py-1 transition hover:bg-white/[0.09]"
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: activeChain.color }}
        />
        <span className="text-[11px] font-semibold text-white/60">{activeChain.shortName}</span>
        <svg
          viewBox="0 0 12 12"
          width="8"
          height="8"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>

      {/* Portal dropdown */}
      {open && pos && createPortal(
        <div
          ref={dropRef}
          style={{
            position: "fixed",
            top: pos.top,
            right: pos.right,
            zIndex: 9999,
            width: 192,
            maxWidth: "calc(100vw - 32px)",
          }}
          className="overflow-hidden rounded-xl border border-white/[0.1] bg-[#1c1c1e] shadow-2xl shadow-black/70 divide-y divide-white/[0.06]"
        >
          {chains.map((chain: ChainConfig) => (
            <button
              key={chain.id}
              onClick={() => { setActiveChain(chain); setOpen(false); }}
              className={[
                "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] min-h-[44px] transition hover:bg-white/[0.05]",
                chain.id === activeChain.id ? "text-white/90" : "text-white/50",
              ].join(" ")}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: chain.color }}
              />
              <span className="flex-1">{chain.name}</span>
              {chain.isTestnet && (
                <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white/30">
                  test
                </span>
              )}
              {chain.id === activeChain.id && (
                <svg
                  viewBox="0 0 12 12"
                  width="10"
                  height="10"
                  fill="none"
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 6l3 3 5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

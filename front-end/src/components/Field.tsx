import { useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  pasteButton?: boolean;
  onPasteValue?: (value: string) => void;
};

export function Field({
  label,
  prefix,
  suffix,
  hint,
  error,
  className = "",
  pasteButton,
  onPasteValue,
  ...rest
}: Props) {
  const [pasted, setPasted] = useState(false);

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text && onPasteValue) {
        onPasteValue(text.trim());
        setPasted(true);
        setTimeout(() => setPasted(false), 1400);
      }
    } catch { /* clipboard permission denied */ }
  }

  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-semibold text-white/70">{label}</span>
      )}
      <span className={[
        "flex h-12 items-center gap-2 rounded-xl bg-black px-4 transition-all duration-150",
        error
          ? "border border-red-500/60"
          : "border border-white/[0.08] focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20",
      ].join(" ")}>
        {prefix && <span className="shrink-0 text-white/40">{prefix}</span>}
        <input
          {...rest}
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          className={[
            "min-w-0 flex-1 bg-transparent text-base text-white/90 outline-none placeholder:text-white/30",
            className,
          ].join(" ")}
        />
        {pasteButton && (
          <button
            type="button"
            onClick={handlePaste}
            aria-label="Paste from clipboard"
            className={[
              "flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition",
              pasted
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-white/[0.07] text-white/50 hover:bg-white/[0.12] hover:text-white/80 active:scale-95",
            ].join(" ")}
          >
            {pasted ? (
              <>
                <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 7l3.5 3.5 6.5-7"/></svg>
                Pasted
              </>
            ) : (
              <>
                <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><rect x="4" y="1" width="8" height="10" rx="1.5"/><path d="M2 4H1.5A1.5 1.5 0 000 5.5v7A1.5 1.5 0 001.5 14h7A1.5 1.5 0 0010 12.5V12"/></svg>
                Paste
              </>
            )}
          </button>
        )}
        {suffix && <span className="shrink-0">{suffix}</span>}
      </span>
      {error ? (
        <span className="mt-1.5 block text-xs text-red-400">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-white/40">{hint}</span>
      ) : null}
    </label>
  );
}

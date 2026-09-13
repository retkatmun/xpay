import { useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** Show a paste button that reads from the clipboard and sets the value. */
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
        // flash "Pasted" for 1.4 s
        setPasted(true);
        setTimeout(() => setPasted(false), 1400);
      }
    } catch {
      // clipboard permission denied — silently ignore
    }
  }

  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-semibold text-gray-700">{label}</span>
      )}
      <span
        className={[
          "flex h-12 items-center gap-2 rounded-xl bg-white px-4",
          "transition-all duration-150",
          error ? "border border-red-400" : "border border-gray-200",
        ].join(" ")}
      >
        {prefix && <span className="shrink-0 text-gray-400">{prefix}</span>}
        <input
          {...rest}
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          className={[
            // text-base = 16px — prevents iOS auto-zoom on focus
            "min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400",
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
                ? "bg-green-50 text-green-600"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 active:scale-95",
            ].join(" ")}
          >
            {pasted ? (
              <>
                <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 7l3.5 3.5 6.5-7" />
                </svg>
                Pasted
              </>
            ) : (
              <>
                <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="1" width="8" height="10" rx="1.5" />
                  <path d="M2 4H1.5A1.5 1.5 0 000 5.5v7A1.5 1.5 0 001.5 14h7A1.5 1.5 0 0010 12.5V12" />
                </svg>
                Paste
              </>
            )}
          </button>
        )}
        {suffix && <span className="shrink-0">{suffix}</span>}
      </span>
      {error ? (
        <span className="mt-1.5 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-gray-500">{hint}</span>
      ) : null}
    </label>
  );
}

import { useState } from "react";

/**
 * Standalone paste-from-clipboard button.
 * Use this next to any raw <input> that doesn't go through <Field>.
 *
 * @param onPaste - called with the trimmed clipboard text
 * @param className - extra classes for positioning
 */
export function PasteButton({
  onPaste,
  className = "",
}: {
  onPaste: (value: string) => void;
  className?: string;
}) {
  const [pasted, setPasted] = useState(false);

  async function handleClick() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        onPaste(text.trim());
        setPasted(true);
        setTimeout(() => setPasted(false), 1400);
      }
    } catch {
      // clipboard permission denied — silently ignore
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Paste from clipboard"
      className={[
        "flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition active:scale-95",
        pasted
          ? "bg-green-50 text-green-600"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700",
        className,
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
  );
}

import type { InputHTMLAttributes, ReactNode } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
};

export function Field({ label, prefix, suffix, hint, error, className = "", ...rest }: Props) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-semibold text-gray-700">{label}</span>
      )}
      <span
        className={[
          "flex h-12 items-center gap-2 rounded-xl bg-white px-4",
          "transition-all duration-150",
          error
            ? "border border-red-400 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100"
            : "border border-gray-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100",
        ].join(" ")}
      >
        {prefix && <span className="shrink-0 text-gray-400">{prefix}</span>}
        <input
          {...rest}
          className={[
            "min-w-0 flex-1 bg-transparent text-[0.95rem] text-gray-900 outline-none placeholder:text-gray-400",
            className,
          ].join(" ")}
        />
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

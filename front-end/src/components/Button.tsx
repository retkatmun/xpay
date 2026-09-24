import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "./icons";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size    = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  loading?: boolean;
};

const base =
  "inline-flex items-center justify-center gap-2 font-medium tracking-[-0.01em] transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111113] disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-emerald-500 text-white hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-white/[0.07] disabled:text-white/30",
  secondary:
    "bg-white/[0.06] text-white/80 border border-white/[0.08] hover:bg-white/[0.10] hover:border-white/20 active:bg-white/[0.12] disabled:text-white/30 disabled:border-white/[0.05]",
  ghost:
    "bg-transparent text-white/50 hover:text-white/90 hover:bg-white/[0.06] active:bg-white/[0.10] disabled:text-white/25",
  danger:
    "bg-red-600 text-white hover:bg-red-500 active:bg-red-700 disabled:bg-white/[0.07] disabled:text-white/30",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm rounded-xl",
  md: "h-11 px-5 text-[0.95rem] rounded-xl",
  lg: "h-13 px-6 text-base rounded-2xl",
};

export function Button({
  variant = "primary",
  size    = "md",
  full,
  loading,
  disabled,
  children,
  className = "",
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={[base, variants[variant], sizes[size], full ? "w-full" : "", className].join(" ")}
    >
      {loading && <Spinner className="shrink-0" />}
      {children}
    </button>
  );
}

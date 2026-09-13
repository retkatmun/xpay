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
  "inline-flex items-center justify-center gap-2 font-medium tracking-[-0.01em] transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-100 disabled:text-gray-400",
  secondary:
    "bg-white text-gray-800 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100 disabled:text-gray-400 disabled:border-gray-100",
  ghost:
    "bg-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50 active:bg-gray-100 disabled:text-gray-300",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-gray-100 disabled:text-gray-400",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm rounded-lg",
  md: "h-11 px-5 text-[0.95rem] rounded-xl",
  lg: "h-13 px-6 text-base rounded-xl",
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
      className={[
        base,
        variants[variant],
        sizes[size],
        full ? "w-full" : "",
        className,
      ].join(" ")}
    >
      {loading && <Spinner className="shrink-0" />}
      {children}
    </button>
  );
}

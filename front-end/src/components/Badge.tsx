
type Variant = "default" | "blue" | "green" | "red" | "amber";

const styles: Record<Variant, string> = {
  default: "bg-gray-100 text-gray-600",
  blue:    "bg-blue-50 text-blue-700",
  green:   "bg-green-50 text-green-700",
  red:     "bg-red-50 text-red-600",
  amber:   "bg-amber-50 text-amber-700",
};

const dots: Record<Variant, string> = {
  default: "bg-gray-400",
  blue:    "bg-blue-500",
  green:   "bg-green-500",
  red:     "bg-red-500",
  amber:   "bg-amber-500",
};

export function Badge({
  children,
  variant = "default",
  dot,
  pulse,
}: {
  children: React.ReactNode;
  variant?: Variant;
  dot?: boolean;
  pulse?: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[variant],
      ].join(" ")}
    >
      {dot && (
        <span
          className={[
            "h-1.5 w-1.5 rounded-full",
            dots[variant],
            pulse ? "animate-[fx-pulse_1.5s_ease-in-out_infinite]" : "",
          ].join(" ")}
        />
      )}
      {children}
    </span>
  );
}

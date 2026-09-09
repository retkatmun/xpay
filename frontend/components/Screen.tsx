"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "./icons";

export function Screen({
  children, back, onBack, action, bare,
}: {
  children: React.ReactNode;
  back?: boolean;
  onBack?: () => void;
  action?: React.ReactNode;
  bare?: boolean;
}) {
  const router = useRouter();
  return (
    <div className="min-h-dvh bg-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-[26.25rem] flex-col px-5">
        {!bare && (
          <header className="flex h-14 shrink-0 items-center justify-between">
            {back ? (
              <button
                type="button"
                onClick={onBack ?? (() => router.back())}
                aria-label="Go back"
                className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <ArrowLeft />
              </button>
            ) : (
              <span className="font-[var(--font-instrument-serif)] text-xl tracking-[-0.01em] text-blue-600">
                XPay
              </span>
            )}
            {action}
          </header>
        )}
        {children}
      </div>
    </div>
  );
}

export function Title({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rise">
      <h1 className="font-[var(--font-instrument-serif)] text-[1.85rem] leading-[1.2] tracking-[-0.02em] text-gray-900">
        {children}
      </h1>
      {sub && <p className="mt-2 text-[0.92rem] leading-relaxed text-gray-500">{sub}</p>}
    </div>
  );
}

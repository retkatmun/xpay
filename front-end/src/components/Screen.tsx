import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "./icons";
import xpayLogo from "@/assets/xpay_logo.png";

export function Screen({
  children,
  back,
  onBack,
  action,
  bare,
  title,
}: {
  children: React.ReactNode;
  back?: boolean;
  onBack?: () => void;
  action?: React.ReactNode;
  bare?: boolean;
  title?: string;
}) {
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-[#111113] text-white">
      {!bare && (
        <nav className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.06] bg-[#111113]/95 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[26.25rem] items-center justify-between px-5">
            {back ? (
              <button
                type="button"
                onClick={onBack ?? (() => navigate(-1))}
                aria-label="Go back"
                className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-white/40 transition hover:bg-white/[0.06] hover:text-white/80"
              >
                <ArrowLeft />
              </button>
            ) : (
              <Link to="/home">
                <img src={xpayLogo} alt="XPay" className="h-7 w-auto object-contain brightness-0 invert opacity-90" />
              </Link>
            )}

            {title && (
              <span className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-white/90">
                {title}
              </span>
            )}

            <div className="flex items-center">{action}</div>
          </div>
        </nav>
      )}

      <div className={["mx-auto w-full max-w-[26.25rem] px-5", bare ? "" : "pt-14"].join(" ")}>
        <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Title({
  children,
  sub,
}: {
  children: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rise">
      <h1 className="text-2xl font-bold tracking-tight text-white">
        {children}
      </h1>
      {sub && (
        <p className="mt-1.5 text-sm leading-relaxed text-white/50">{sub}</p>
      )}
    </div>
  );
}

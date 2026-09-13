import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "./icons";
import xpayLogo from "@/assets/xpay_logo.png";

/**
 * Full-page shell with a fixed top navbar — identical chrome to the home page.
 *
 * Props:
 *   back     – show a back-arrow instead of the logo
 *   onBack   – custom back handler (defaults to navigate(-1))
 *   action   – optional right-side slot (e.g. a "Done" button)
 *   bare     – skip the navbar entirely (used for full-screen loading/done states)
 *   title    – optional centre title text shown next to / instead of logo
 */
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
    <div className="min-h-dvh bg-white">
      {/* ── Fixed top navbar ── */}
      {!bare && (
        <nav className="fixed inset-x-0 top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-[26.25rem] items-center justify-between px-5">
            {/* Left: back arrow OR logo */}
            {back ? (
              <button
                type="button"
                onClick={onBack ?? (() => navigate(-1))}
                aria-label="Go back"
                className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <ArrowLeft />
              </button>
            ) : (
              <Link to="/home">
                <img src={xpayLogo} alt="XPay" className="h-7 w-auto object-contain" />
              </Link>
            )}

            {/* Centre: optional page title */}
            {title && (
              <span className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-gray-900">
                {title}
              </span>
            )}

            {/* Right slot */}
            <div className="flex items-center">{action}</div>
          </div>
        </nav>
      )}

      {/* ── Scrollable body — padded below fixed navbar ── */}
      <div
        className={[
          "mx-auto w-full max-w-[26.25rem] px-5",
          bare ? "" : "pt-14",
        ].join(" ")}
      >
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
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">
        {children}
      </h1>
      {sub && (
        <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{sub}</p>
      )}
    </div>
  );
}

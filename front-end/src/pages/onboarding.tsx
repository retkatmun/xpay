import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { usePrivy, useWallets, useCreateWallet } from "@privy-io/react-auth";
import { isUsernameTaken, createProfile } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { Spinner } from "@/components/icons";
import { PhoneInput } from "@/components/PhoneInput";
import xpayLogo from "@/assets/xpay_logo.png";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "auth" | "profile" | "pin" | "done";

type Draft = {
  phone: string;
  phoneValid: boolean;
  displayName: string;
  username: string;
};

const EMPTY: Draft = {
  phone: "", phoneValid: false, displayName: "", username: "",
};
const USERNAME_RE = /^[a-z][a-z0-9_]{2,15}$/;
const VISIBLE_STEPS: Step[] = ["auth", "profile", "pin"];

// ─── Step progress bar ────────────────────────────────────────────────────────

const STEP_LABELS: Record<Step, string> = {
  auth:    "Account",
  profile: "Profile",
  pin:     "Security",
  done:    "Done",
};

function StepBar({ current }: { current: Step }) {
  const idx = VISIBLE_STEPS.indexOf(current);
  return (
    <div className="mb-8 flex items-start justify-between">
      {VISIBLE_STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={s} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={[
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300",
                  done
                    ? "bg-emerald-500 text-white"
                    : active
                    ? "bg-emerald-500 text-white ring-4 ring-emerald-900/30"
                    : "bg-white/[0.07] text-white/40",
                ].join(" ")}
              >
                {done ? (
                  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={[
                  "text-[10px] font-semibold tracking-wide",
                  active ? "text-emerald-400" : done ? "text-emerald-500" : "text-white/40",
                ].join(" ")}
              >
                {STEP_LABELS[s]}
              </span>
            </div>
            {i < VISIBLE_STEPS.length - 1 && (
              <div
                className={[
                  "mx-2 mb-5 h-px flex-1 transition-all duration-500",
                  i < idx ? "bg-emerald-500/100" : "bg-white/[0.07]",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── PIN numpad ───────────────────────────────────────────────────────────────

function PinPad({
  value,
  onChange,
  label,
  hint,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  hint?: string;
  error?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-white/70">{label}</p>
      {hint && <p className="mb-4 text-xs text-white/40">{hint}</p>}

      {/* Simple dots — no boxes */}
      <div className="mb-8 flex justify-center gap-4" onClick={() => inputRef.current?.focus()}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={[
              "h-4 w-4 rounded-full transition-all duration-150",
              value[i]
                ? "bg-emerald-500 scale-110"
                : i === value.length
                ? "bg-white/30 ring-2 ring-emerald-500 ring-offset-2 ring-offset-[#111113]"
                : "bg-white/15",
            ].join(" ")}
          />
        ))}
      </div>

      {/* Hidden input for mobile keyboard */}
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        className="sr-only"
        aria-label={label}
      />

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-2.5" onMouseDown={(e) => e.preventDefault()}>
        {([1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"] as const).map((k, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              if (k === "") return;
              if (k === "⌫") onChange(value.slice(0, -1));
              else if (value.length < 4) onChange(value + String(k));
            }}
            className={[
              "h-14 rounded-2xl text-lg font-semibold transition-all duration-100 select-none active:scale-95",
              k === ""
                ? "pointer-events-none"
                : k === "⌫"
                ? "bg-white/[0.07] hover:bg-white/[0.12] text-white/60"
                : "bg-[#1c1c1e] hover:bg-[#252528] text-white/90 border border-white/[0.08]",
            ].join(" ")}
          >
            {k}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 text-center text-sm font-medium text-red-400">{error}</p>
      )}
    </div>
  );
}

// ─── Error box ────────────────────────────────────────────────────────────────

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3">
      <svg className="mt-0.5 shrink-0" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round">
        <circle cx="8" cy="8" r="7" />
        <path d="M8 5v3.5M8 11h.01" />
      </svg>
      <p className="text-sm text-red-400">{message}</p>
    </div>
  );
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <div className="mb-8 flex justify-center">
      <img src={xpayLogo} alt="XPay" className="h-12 w-auto object-contain" />
    </div>
  );
}

// ─── Main Onboarding ──────────────────────────────────────────────────────────

export default function Onboarding() {
  const navigate = useNavigate();
  const { authUser, profile, loading, setProfile } = useSession();
  const { ready: privyReady, authenticated: privyAuthed, user: privyUser, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();

  const [step, setStep] = useState<Step>("auth");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [usernameState, setUsernameState] = useState<"idle" | "checking" | "ok" | "taken">("idle");

  const [pinStage, setPinStage] = useState<"choose" | "confirm">("choose");
  const [firstPin, setFirstPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  // Get embedded wallet address — may be null until createWallet() is called
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === "privy");
  const walletAddress = embeddedWallet?.address ?? null;

  // Only redirect if user is fully authenticated AND has completed profile
  useEffect(() => {
    if (!loading && authUser && profile) {
      navigate("/home", { replace: true });
    }
    // Don't redirect if user is authenticated but has no profile - let them complete onboarding
  }, [loading, authUser, profile, navigate]);

  // When Privy auth completes, advance to profile step
  useEffect(() => {
    if (!privyReady) return;
    if (privyAuthed && step === "auth") {
      const name =
        (privyUser?.google as { name?: string } | null)?.name ??
        privyUser?.email?.address?.split("@")[0] ??
        "";
      patch({ displayName: name });
      setStep("profile");
    }
  }, [privyReady, privyAuthed, step, privyUser]); // Added privyUser to deps

  // Username availability check
  useEffect(() => {
    if (!USERNAME_RE.test(draft.username)) {
      setUsernameState("idle");
      return;
    }
    setUsernameState("checking");
    const id = setTimeout(async () => {
      const taken = await isUsernameTaken(draft.username);
      setUsernameState(taken ? "taken" : "ok");
    }, 400);
    return () => clearTimeout(id);
  }, [draft.username]);

  if (!privyReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#1a1a1c]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <span className="ml-3">Loading authentication...</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#1a1a1c]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <span className="ml-3">Loading profile...</span>
      </div>
    );
  }

  // ── Profile: continue ──────────────────────────────────────────────────────
  function handleProfileContinue() {
    setError(null);
    if (!draft.displayName.trim()) { setError("Enter your full name."); return; }
    if (!draft.phone.trim()) { setError("Enter your phone number."); return; }
    if (!draft.phoneValid) { setError("Enter a valid phone number for the selected country."); return; }
    if (!USERNAME_RE.test(draft.username)) {
      setError("Username must be 3–16 characters, start with a letter, and use only letters, numbers, or underscores.");
      return;
    }
    if (usernameState === "taken") { setError("That username is already taken. Please choose another."); return; }
    if (usernameState === "checking") { setError("Still checking username availability…"); return; }
    setStep("pin");
  }

  // ── PIN ────────────────────────────────────────────────────────────────────
  function handleFirstPin(v: string) {
    setPinError(null);
    setFirstPin(v);
    if (v.length === 4) {
      const weak = /^(.)\1{3}$|^0123$|^1234$|^4321$|^9876$|^0000$|^1111$/.test(v);
      if (weak) {
        setFirstPin("");
        setPinError("That PIN is too easy to guess. Choose a different one.");
        return;
      }
      setTimeout(() => setPinStage("confirm"), 120);
    }
  }

  function handleConfirmPin(v: string) {
    setPinError(null);
    setConfirmPin(v);
    if (v.length === 4) {
      if (v !== firstPin) {
        setPinError("PINs don't match. Let's try again.");
        setFirstPin(""); setConfirmPin(""); setPinStage("choose");
        return;
      }
      handleCreateAccount(v);
    }
  }

  // ── Create account ─────────────────────────────────────────────────────────
  async function handleCreateAccount(pin: string) {
    setBusy(true);
    setError(null);
    try {
      if (!privyUser?.id) throw new Error("Not authenticated. Please sign in again.");

      const email =
        privyUser.email?.address ??
        (privyUser.google as { email?: string } | null)?.email ??
        null;

      let resolvedWalletAddress = walletAddress;
      if (!resolvedWalletAddress) {
        try {
          const newWallet = await createWallet();
          resolvedWalletAddress = newWallet.address ?? null;
        } catch {
          resolvedWalletAddress = null;
        }
      }

      const created = await createProfile({
        id: privyUser.id,
        email,
        phone: draft.phone,
        username: draft.username.toLowerCase().trim(),
        display_name: draft.displayName.trim(),
        pin_hash: pin,
        wallet_address: resolvedWalletAddress,
      });

      setProfile(created as never);
      // XPay profile done (Stage 1: User created in BMONI happens in bmoni-setup).
      // Redirect to wallet setup — every user must complete all 6 stages.
      setStep("done");
      setTimeout(() => navigate("/bmoni-setup", { replace: true }), 2200);
    } catch (e: unknown) {
      setBusy(false);
      setConfirmPin(""); setFirstPin(""); setPinStage("choose");

      const msg = e instanceof Error ? e.message : "";
      if (msg.toLowerCase().includes("username")) {
        setError(msg); setStep("profile");
      } else if (msg.toLowerCase().includes("authenticated")) {
        setError(msg); setStep("auth");
      } else {
        setError(msg || "Account creation failed. Please try again.");
        setStep("profile");
      }
    } finally {
      setBusy(false);
    }
  }

  // (enrollment removed — users go straight to home after PIN)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex min-h-dvh flex-col bg-[#111113]">
      {/* Top gradient accent */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-emerald-950/30 to-transparent" />

      <div className="relative flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">

          <Logo />

          {step !== "done" && <StepBar current={step} />}

          {/* ── STEP: auth ─────────────────────────────────────────────── */}
          {step === "auth" && (
            <div className="animate-[fadeSlideUp_0.3s_ease-out]">
              <h1 className="text-2xl font-bold tracking-tight text-white/90">
                Create your account
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-white/50">
                Join XPay to send and receive money instantly.
              </p>

              <button
                onClick={() => login()}
                disabled={busy}
                className="mt-8 flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-emerald-500 text-base font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-400 active:scale-[.98] disabled:opacity-60"
              >
                Get started
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10h12M12 6l4 4-4 4" />
                </svg>
              </button>

              {/* Trust signals */}
              <div className="mt-8 grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center gap-2 rounded-xl bg-[#161618] px-2 py-3.5 text-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20">
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 2l6 2.5V10c0 3.5-2.5 6-6 8-3.5-2-6-4.5-6-8V4.5L10 2z"/>
                    </svg>
                  </div>
                  <span className="text-[10px] font-medium leading-tight text-white/50">Secured by Privy</span>
                </div>
                <div className="flex flex-col items-center gap-2 rounded-xl bg-[#161618] px-2 py-3.5 text-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#d97706" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 3L4 12h7l-2 5 7-9h-7l2-5z"/>
                    </svg>
                  </div>
                  <span className="text-[10px] font-medium leading-tight text-white/50">Instant transfers</span>
                </div>
                <div className="flex flex-col items-center gap-2 rounded-xl bg-[#161618] px-2 py-3.5 text-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20">
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#16a34a" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="10" cy="10" r="8"/>
                      <path d="M2 10h16M10 2a14 14 0 010 16M10 2a14 14 0 000 16"/>
                    </svg>
                  </div>
                  <span className="text-[10px] font-medium leading-tight text-white/50">Send to any bank</span>
                </div>
              </div>

              {error && <ErrorBox message={error} />}

              <p className="mt-6 text-center text-xs text-white/40">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="font-semibold text-emerald-400 hover:underline"
                >
                  Sign in
                </button>
              </p>

              {/* Show option to sign out if already authenticated */}
              {privyAuthed && (
                <p className="mt-3 text-center text-xs text-white/40">
                  Want to use a different account?{" "}
                  <button
                    type="button"
                    onClick={async () => {
                      await logout();
                      setStep("auth");
                    }}
                    className="font-semibold text-emerald-400 hover:underline"
                  >
                    Sign out
                  </button>
                </p>
              )}
            </div>
          )}

          {/* ── STEP: profile ──────────────────────────────────────────── */}
          {step === "profile" && (
            <div className="animate-[fadeSlideUp_0.3s_ease-out]">
              <h1 className="text-2xl font-bold tracking-tight text-white/90">
                Set up your profile
              </h1>
              <p className="mt-2 text-sm text-white/50">
                Almost done. Fill in a few details.
              </p>

              {/* Info callout */}
              <div className="mt-5 flex gap-3 rounded-xl border border-emerald-900/30 bg-emerald-500/10 p-4">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="8" r="7" />
                    <path d="M8 7v5M8 5h.01" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-300">How people pay you</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-emerald-400">
                    Your <strong>phone number</strong> and <strong>@username</strong> are your payment addresses.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {/* Full name */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-white/70">Full name</label>
                  <input
                    value={draft.displayName}
                    onChange={(e) => { patch({ displayName: e.target.value }); setError(null); }}
                    placeholder="Bola Adeyemi"
                    autoComplete="name"
                    autoFocus
                    className="h-12 w-full rounded-xl border border-white/[0.08] bg-[#111113] px-4 text-base text-white/90 outline-none transition placeholder:text-white/40 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                {/* Phone with country selector */}
                <PhoneInput
                  label="Phone number"
                  value={draft.phone}
                  onChange={(phone, isValid) => {
                    patch({ phone, phoneValid: isValid });
                    setError(null);
                  }}
                  hint="Used as your payment address. People can send you money using this number"
                  error={error && error.toLowerCase().includes("phone") ? error : null}
                />

                {/* Username */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-white/70">Username</label>
                  <div className="relative">
                    <div
                      className={[
                        "flex h-12 items-center rounded-xl border bg-[#111113] transition-all duration-150",
                        usernameState === "taken"
                          ? "border-red-400 ring-2 ring-red-100"
                          : usernameState === "ok"
                          ? "border-green-400 ring-2 ring-green-100"
                          : "border-white/[0.08] focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-900/30",
                      ].join(" ")}
                    >
                      <span className="pl-4 text-sm font-medium text-white/40">@</span>
                      <input
                        value={draft.username}
                        onChange={(e) => {
                          const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
                          patch({ username: v });
                          setError(null);
                        }}
                        placeholder="yourhandle"
                        className="h-full flex-1 bg-transparent px-2 text-base text-white/90 outline-none placeholder:text-white/40"
                      />
                      <span className="pr-3.5">
                        {usernameState === "checking" && <Spinner className="h-4 w-4 text-white/40" />}
                        {usernameState === "ok" && (
                          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 8l3.5 3.5 6.5-7" />
                          </svg>
                        )}
                        {usernameState === "taken" && (
                          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M4 4l8 8M12 4l-8 8" />
                          </svg>
                        )}
                      </span>
                    </div>
                  </div>
                  <p className={[
                    "mt-1.5 text-xs",
                    usernameState === "ok" ? "text-emerald-400"
                    : usernameState === "taken" ? "text-red-400"
                    : "text-white/40",
                  ].join(" ")}>
                    {usernameState === "ok"
                      ? `✓ @${draft.username} is available`
                      : usernameState === "taken"
                      ? "Username already taken. Please choose another"
                      : "3–16 chars · letters, numbers, underscore"}
                  </p>
                </div>
              </div>

              {error && !error.toLowerCase().includes("phone") && <ErrorBox message={error} />}

              <button
                onClick={handleProfileContinue}
                disabled={
                  busy ||
                  !draft.displayName.trim() ||
                  !draft.phone.trim() ||
                  !draft.phoneValid ||
                  usernameState !== "ok"
                }
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-semibold text-white shadow-sm shadow-emerald-900/30 transition hover:bg-emerald-400 active:scale-[.98] disabled:cursor-not-allowed disabled:bg-white/[0.07] disabled:text-white/40 disabled:shadow-none"
              >
                {busy && <Spinner className="h-4 w-4" />}
                Continue
              </button>
            </div>
          )}

          {/* ── STEP: pin ──────────────────────────────────────────────── */}
          {step === "pin" && (
            <div className="animate-[fadeSlideUp_0.3s_ease-out]">
              <h1 className="text-2xl font-bold tracking-tight text-white/90">
                {pinStage === "choose" ? "Choose a PIN" : "Confirm your PIN"}
              </h1>
              <p className="mt-2 mb-7 text-sm text-white/50">
                {pinStage === "choose"
                  ? "You'll use this 4-digit PIN to approve every payment."
                  : "Enter it again to confirm."}
              </p>

              {pinStage === "choose" ? (
                <PinPad
                  key="choose"
                  label="Choose 4-digit PIN"
                  hint="Avoid repeated digits or sequences like 1234."
                  value={firstPin}
                  onChange={handleFirstPin}
                  error={pinError}
                />
              ) : (
                <PinPad
                  key="confirm"
                  label="Confirm PIN"
                  value={confirmPin}
                  onChange={handleConfirmPin}
                  error={pinError}
                />
              )}

              {busy && (
                <div className="mt-6 flex items-center justify-center gap-2 text-sm text-white/50">
                  <Spinner className="h-4 w-4 text-emerald-400" />
                  Creating your account…
                </div>
              )}

              {error && <ErrorBox message={error} />}

              <p className="mt-6 text-center text-xs text-white/40">
                Never share your PIN. Not even with XPay support.
              </p>
            </div>
          )}

          {/* ── STEP: done ─────────────────────────────────────────────── */}
          {step === "done" && (
            <div className="flex flex-col items-center text-center animate-[fadeSlideUp_0.4s_ease-out]">
              <div className="relative flex h-24 w-24 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-[ping_0.9s_ease-out_1]" />
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/20">
                  <svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 24l10 10 18-20" />
                  </svg>
                </div>
              </div>

              <h1 className="mt-6 text-2xl font-bold tracking-tight text-white/90">You're all set!</h1>
              <p className="mt-2 text-sm leading-relaxed text-white/50">
                Welcome to XPay,{" "}
                <span className="font-semibold text-white/90">{draft.displayName}</span>.
                Now let's set up your NGN wallet.
              </p>

              <div className="mt-5 flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#161618] px-4 py-2">
                <span className="text-sm text-white/50">Your handle:</span>
                <span className="font-mono text-sm font-semibold text-emerald-400">@{draft.username}</span>
              </div>

              <div className="mt-8 h-1.5 w-48 overflow-hidden rounded-full bg-white/[0.07]">
                <div className="h-full w-full origin-left animate-[grow_2.2s_ease-in-out_forwards] rounded-full bg-emerald-500" />
              </div>
              <p className="mt-3 text-xs text-white/40">Setting up your wallet…</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { CodeInput } from "@/components/CodeInput";
import { prettyPhone, requestOtp, verifyOtp, ApiError } from "@/lib/api";
import { getDraft, patchDraft } from "@/lib/onboarding";

const RESEND = 30;

export default function VerifyStep() {
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | undefined>(undefined);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(RESEND);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);

  useEffect(() => {
    const draft = getDraft();
    if (!draft.phone) {
      router.replace("/phone");
      return;
    }
    setPhone(draft.phone);
    setDevCode(draft.devCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount — router is stable

  useEffect(() => {
    if (countdown === 0) return;
    // setState is inside a setTimeout callback, not synchronous — lint false positive
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  async function submit(value: string) {
    if (!phone) return;
    setBusy(true);
    setError(null);
    const result = await verifyOtp(phone, value);
    setBusy(false);
    if (!result.ok) {
      setCode("");
      const reason = result.signupToken ? "server_error" : (result as { reason?: string }).reason;
      if (reason === "expired") {
        setError("That code has expired. Request a new one below.");
      } else if (reason === "too_many_attempts") {
        setError("Too many wrong attempts. Please request a new code.");
      } else {
        setError("That code didn't match. Double-check and try again.");
      }
      return;
    }
    patchDraft({ verified: true, signupToken: result.signupToken });
    router.push("/pin");
  }

  function handleCode(next: string) {
    setError(null);
    setCode(next);
    if (next.length === 6 && !busy) void submit(next);
  }

  async function handleResend() {
    if (!phone || resendBusy) return;
    setResendError(null);
    setResendBusy(true);
    try {
      const result = await requestOtp(phone);
      patchDraft({ devCode: result.devCode });
      setDevCode(result.devCode);
      setCountdown(RESEND);
      setCode("");
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.reason === "sms_unavailable") {
          setResendError("SMS unavailable right now. Please try again shortly.");
        } else if (err.reason === "too_many_requests") {
          setResendError("Too many attempts. Please wait a few minutes.");
        } else {
          setResendError("Couldn't resend the code. Check your connection.");
        }
      } else {
        setResendError("Couldn't reach the server. Check your connection.");
      }
    } finally {
      setResendBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="font-[var(--font-instrument-serif)] text-3xl text-blue-600">XPay</span>
        </div>

        <h1 className="font-[var(--font-instrument-serif)] text-[1.75rem] leading-tight tracking-[-0.02em] text-gray-900">
          Enter the code
        </h1>
        {phone && (
          <p className="mt-2 text-sm text-gray-500">
            Sent to <span className="tabular-nums text-gray-800">{prettyPhone(phone)}</span>.{" "}
            <button type="button" onClick={() => router.replace("/phone")}
              className="text-blue-600 hover:underline">Change</button>
          </p>
        )}

        {/* dev code banner */}
        {devCode && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Dev mode — no SMS sent</p>
            <p className="mt-1 text-sm text-amber-800">
              Your code is{" "}
              <span className="font-mono text-xl font-bold tracking-[0.15em]">{devCode}</span>
            </p>
          </div>
        )}

        <div className="mt-7">
          <CodeInput label="6-digit code" length={6} value={code} onChange={handleCode} error={!!error} autoFocus />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-6">
          <Button full variant="ghost"
            disabled={countdown > 0 || resendBusy}
            onClick={handleResend}>
            {resendBusy
              ? "Sending…"
              : countdown > 0
              ? `Resend in ${countdown}s`
              : "Resend code"}
          </Button>
          {resendError && (
            <p className="mt-2 text-center text-sm text-red-600">{resendError}</p>
          )}
        </div>
      </div>
    </div>
  );
}

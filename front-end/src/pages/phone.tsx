
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { normalizePhone, requestOtp, ApiError } from "@/lib/api";
import { getDraft, patchDraft } from "@/lib/onboarding";

export default function PhoneStep() {
  const navigate = useNavigate();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const phone = normalizePhone(raw);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone) { setError("Enter a valid Nigerian phone number."); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await requestOtp(phone);
      // Preserve the intent (login vs signup) already set in the draft.
      const existingDraft = getDraft();
      patchDraft({ phone, verified: false, devCode: result.devCode, intent: existingDraft.intent ?? "signup" });
      navigate("/verify");
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError) {
        if (err.reason === "sms_unavailable") {
          setError("SMS delivery is unavailable right now. Please try again shortly.");
        } else if (err.reason === "invalid") {
          setError("That phone number isn't valid. Check it and try again.");
        } else if (err.reason === "too_many_requests") {
          setError("Too many attempts. Please wait a moment before trying again.");
        } else {
          setError("Couldn't send the code. Please check your connection and try again.");
        }
      } else {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-5 py-12">
      <div className="w-full max-w-sm">
        {/* logo */}
        <div className="mb-8 text-center">
          <span className="font-[var(--font-instrument-serif)] text-3xl text-blue-600">XPay</span>
        </div>

        <h1 className="font-[var(--font-instrument-serif)] text-[1.75rem] leading-tight tracking-[-0.02em] text-gray-900">
          What&rsquo;s your number?
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          We&rsquo;ll send a one-time code to confirm it&rsquo;s you.
        </p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <Field
            label="Phone number"
            value={raw}
            onChange={e => { setRaw(e.target.value); setError(null); }}
            onBlur={() => { if (raw && !phone) setError("That doesn't look right."); }}
            placeholder="0803 123 4567"
            inputMode="tel"
            autoComplete="tel"
            autoFocus
            error={error}
            hint={phone ? phone : "Nigerian numbers work with or without +234"}
          />
          <Button full type="submit" disabled={!phone} loading={busy} size="lg">
            Continue
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          Your number is your XPay identity. It stays private.
        </p>

        <p className="mt-4 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <a href="/login" className="font-medium text-blue-600 hover:underline">Log in</a>
        </p>
      </div>
    </div>
  );
}

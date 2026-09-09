"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { CodeInput } from "@/components/CodeInput";
import { login, normalizePhone, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useSession();
  const [raw, setRaw] = useState("");
  const [pin, setPin] = useState("");
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const phone = normalizePhone(raw);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone) { setPhoneErr("Enter a valid phone number."); return; }
    if (pin.length < 4) { setPinErr("Enter your 4-digit PIN."); return; }
    setBusy(true); setPhoneErr(null); setPinErr(null);
    try {
      const { user } = await login({ phone, pin });
      setUser(user); router.replace("/home");
    } catch (err) {
      setBusy(false);
      const reason = err instanceof ApiError ? err.reason : "server_error";
      if (reason === "locked") {
        setPinErr("Too many wrong attempts. Your account is temporarily locked. Try again later.");
      } else if (reason === "wrong_pin") {
        setPinErr("Incorrect PIN. Please try again.");
        setPin("");
      } else if (reason === "invalid") {
        setPhoneErr("That phone number doesn't look right.");
      } else if (reason === "too_many_requests") {
        setPinErr("Too many attempts. Please wait a moment before trying again.");
      } else {
        setPinErr("Something went wrong. Check your connection and try again.");
      }
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="font-[var(--font-instrument-serif)] text-3xl text-blue-600">XPay</span>
        </div>

        <h1 className="font-[var(--font-instrument-serif)] text-[1.75rem] tracking-[-0.02em] text-gray-900">
          Welcome back
        </h1>
        <p className="mt-2 text-sm text-gray-500">Log in to your XPay account.</p>

        <form onSubmit={submit} className="mt-7 space-y-5">
          <Field label="Phone number" value={raw}
            onChange={e => { setRaw(e.target.value); setPhoneErr(null); }}
            onBlur={() => { if (raw && !phone) setPhoneErr("That doesn't look right."); }}
            placeholder="0803 123 4567" inputMode="tel" autoComplete="tel" autoFocus
            error={phoneErr} hint={phone ? phone : undefined} />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">PIN</label>
            <CodeInput label="4-digit PIN" length={4} value={pin}
              onChange={next => { setPin(next); setPinErr(null); }} secret error={!!pinErr} />
            {pinErr && <p className="mt-1.5 text-xs text-red-600">{pinErr}</p>}
          </div>

          <Button full type="submit" disabled={!phone || pin.length < 4} loading={busy} size="lg">
            Log in
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          New to XPay?{" "}
          <a href="/phone" className="font-medium text-blue-600 hover:underline">Create an account</a>
        </p>
      </div>
    </div>
  );
}

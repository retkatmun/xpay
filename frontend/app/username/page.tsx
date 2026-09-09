"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { HandleField } from "@/components/HandleField";
import { Check, Spinner } from "@/components/icons";
import { USERNAME_RULE, checkUsername, createAccount, formatHandle, ApiError } from "@/lib/api";
import { clearDraft, getDraft } from "@/lib/onboarding";
import { useSession } from "@/lib/session";

type Avail = { state: "idle" } | { state: "checking" } | { state: "ok" } | { state: "no"; message: string };
const MSGS: Record<string, string> = {
  taken: "Already taken.",
  reserved: "That one's reserved.",
  invalid: "3–16 chars, letters, numbers and underscores, must start with a letter.",
};

export default function UsernameStep() {
  const router = useRouter();
  const { setUser } = useSession();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [avail, setAvail] = useState<Avail>({ state: "idle" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = getDraft();
    if (!d.phone) router.replace("/phone");
    else if (!d.verified || !d.signupToken) router.replace("/verify");
    else if (!d.pin) router.replace("/pin");
  }, [router]);

  function handleHandle(input: string) {
    const next = input.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setHandle(next);
    setSubmitError(null);
    if (!next) setAvail({ state: "idle" });
    else if (!USERNAME_RULE.test(next)) setAvail({ state: "no", message: MSGS.invalid });
    else setAvail({ state: "checking" });
  }

  useEffect(() => {
    if (!handle || !USERNAME_RULE.test(handle)) return;
    let active = true;
    const id = setTimeout(async () => {
      const r = await checkUsername(handle);
      if (!active) return;
      setAvail(r.available ? { state: "ok" } : { state: "no", message: MSGS[r.reason ?? "invalid"] ?? MSGS.invalid });
    }, 350);
    return () => { active = false; clearTimeout(id); };
  }, [handle]);

  const ready = name.trim().length > 1 && avail.state === "ok" && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const d = getDraft();
    if (!ready || !d.signupToken || !d.pin) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const { user } = await createAccount({
        signupToken: d.signupToken,
        username: handle,
        displayName: name,
        pin: d.pin,
      });
      clearDraft();
      setUser(user);
      router.replace("/home");
    } catch (err) {
      setBusy(false);
      const reason = err instanceof ApiError ? err.reason : "server_error";
      if (reason === "taken") {
        // Username was available when checked but got taken in the race window.
        setAvail({ state: "no", message: "Already taken. Please choose another." });
      } else if (reason === "reserved") {
        setAvail({ state: "no", message: "That handle is reserved. Please choose another." });
      } else if (reason === "phone_registered") {
        // This phone number already has a full account — go to login instead.
        setSubmitError("This number already has an XPay account. Please log in instead.");
      } else if (reason === "unauthorized") {
        // Signup token expired — restart onboarding.
        setSubmitError("Your session expired. Please start sign-up again.");
        setTimeout(() => router.replace("/phone"), 2500);
      } else if (reason === "invalid") {
        setSubmitError("Something looks wrong with your details. Please check and try again.");
      } else {
        setSubmitError("Something went wrong. Please check your connection and try again.");
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
          Almost done
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Your handle is how people find you and send you money.
        </p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <Field label="Your name" value={name} onChange={e => { setName(e.target.value); setSubmitError(null); }}
            placeholder="Bola Adeyemi" autoComplete="name" autoFocus
            hint="What people see when you pay them." />

          <HandleField label="Your XPay handle" value={handle} onChange={handleHandle}
            suffixSlot={
              avail.state === "checking" ? <Spinner className="text-gray-400" /> :
              avail.state === "ok"       ? <Check className="text-green-500" /> : null
            }
            error={avail.state === "no" ? avail.message : null}
            hint={avail.state === "ok" ? `${formatHandle(handle)} is available.` : "People pay you using this handle."} />

          {submitError && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {submitError}
              {submitError.includes("already has an XPay account") && (
                <> <a href="/login" className="font-semibold underline">Log in here.</a></>
              )}
            </p>
          )}

          <Button full type="submit" disabled={!ready} loading={busy} size="lg">
            Create my account
          </Button>
        </form>
      </div>
    </div>
  );
}

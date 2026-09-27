
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CodeInput } from "@/components/CodeInput";
import { getDraft, patchDraft } from "@/lib/onboarding";

function isWeak(p: string) {
  if (/^(\d)\1{3}$/.test(p)) return true;
  return "0123456789".includes(p) || "9876543210".includes(p);
}

export default function PinStep() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<"choose" | "confirm">("choose");
  const [pin, setPin] = useState("");
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = getDraft();
    if (!d.phone) navigate("/phone", { replace: true });
    else if (!d.verified) navigate("/verify", { replace: true });
  }, [navigate]);

  function handleEntry(next: string) {
    setError(null);
    if (next.length < 4) { setEntry(next); return; }
    if (stage === "choose") {
      if (isWeak(next)) { setEntry(""); setError("Pick something harder to guess."); return; }
      setPin(next); setEntry(""); setStage("confirm"); return;
    }
    if (next !== pin) {
      setPin(""); setEntry(""); setStage("choose");
      setError("Those didn't match. Start again."); return;
    }
    setEntry(next);
    patchDraft({ pin });
    navigate("/username");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#111113] px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="font-[var(--font-instrument-serif)] text-3xl text-emerald-400">XPay</span>
        </div>

        {stage === "choose" ? (
          <>
            <h1 className="font-[var(--font-instrument-serif)] text-[1.75rem] tracking-[-0.02em] text-white/90">
              Choose a PIN
            </h1>
            <p className="mt-2 text-sm text-white/50">You&rsquo;ll enter this to approve every payment.</p>
          </>
        ) : (
          <>
            <h1 className="font-[var(--font-instrument-serif)] text-[1.75rem] tracking-[-0.02em] text-white/90">
              Confirm your PIN
            </h1>
            <p className="mt-2 text-sm text-white/50">Enter it once more to make sure it&rsquo;s right.</p>
          </>
        )}

        <div className="mt-8">
          <CodeInput key={stage} label={stage === "choose" ? "Choose PIN" : "Confirm PIN"}
            length={4} value={entry} onChange={handleEntry} secret autoFocus error={!!error} />
          {error
            ? <p className="mt-2 text-sm text-red-400">{error}</p>
            : <p className="mt-2 text-xs text-white/40">Don&rsquo;t use your birth year. Never share it.</p>}
        </div>
      </div>
    </div>
  );
}

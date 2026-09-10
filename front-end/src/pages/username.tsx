/**
 * UsernameStep — legacy page from old phone/OTP flow.
 * The app now uses /onboarding (Privy + Supabase).
 * Redirect stray visits to /onboarding.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function UsernameStep() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/onboarding", { replace: true });
  }, [navigate]);
  return null;
}

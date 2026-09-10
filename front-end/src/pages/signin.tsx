/**
 * SignIn — legacy page kept for backward compat with old phone/OTP flow.
 * The app now uses Privy via /login and /onboarding.
 * Redirect any stray visits to /login.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function SignIn() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/login", { replace: true });
  }, [navigate]);
  return null;
}

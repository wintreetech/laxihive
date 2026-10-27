import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import { post, useAuth } from "../lib/api";

export function EmailVerification({
  returnTo = "/settings",
  optional = false,
}: {
  returnTo?: string;
  optional?: boolean;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (
    !user ||
    user.verified ||
    (!optional && user.emailVerificationRequired === false)
  )
    return null;
  async function send() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await post("/auth/resend-verification");
      if (result.developmentVerificationUrl) {
        const link = new URL(result.developmentVerificationUrl);
        if (link.origin !== window.location.origin)
          throw new Error("The verification address does not match this app.");
        link.searchParams.set("redirect", returnTo);
        navigate(link.pathname + link.search);
      } else setMessage(result.message);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="email-verification">
      <strong>
        <Mail size={16} />{" "}
        {user.emailVerificationRequired === false
          ? "Verify your email (optional)"
          : "Verify your email to continue"}
      </strong>
      <p>
        {user.emailVerificationRequired === false
          ? "Email confirmation is optional during the initial launch. Your account can use available features without it."
          : "Confirm your account email before purchasing coins or unlocking expansions."}
      </p>
      <button
        type="button"
        className="button secondary full"
        disabled={busy}
        onClick={send}
      >
        {busy ? "Preparing verification..." : "Send verification link"}
      </button>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}

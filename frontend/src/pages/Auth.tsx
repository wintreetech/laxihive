import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowLeft,
  Eye,
  EyeOff,
  ShieldCheck,
  Mail,
  Check,
  Hexagon,
} from "lucide-react";
import { z } from "zod";
import { post, useAuth, useToast } from "../lib/api";
import { Art } from "../components/UI";
import { games } from "../../../backend/shared/catalog";
export default function Auth({
  mode = "login",
}: {
  mode?: "login" | "signup" | "forgot" | "reset" | "verify";
}) {
  const { refresh } = useAuth(),
    navigate = useNavigate(),
    toast = useToast();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(""),
    [show, setShow] = useState(false);
  const signup = mode === "signup",
    login = mode === "login";
  const requestedReturn = params.get("redirect");
  const verifiedReturn =
    requestedReturn?.startsWith("/") &&
    !requestedReturn.startsWith("//") &&
    !requestedReturn.includes("\\")
      ? requestedReturn
      : "/dashboard";
  const title = {
    login: "Back for a little brilliance?",
    signup: "Your next chapter starts here.",
    forgot: "Let’s get you back to play.",
    reset: "A fresh start for your account.",
    verify: "One last little connection.",
  }[mode];
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (signup) {
        z.object({
          displayName: z.string().trim().min(2).max(32),
          email: z.email(),
          password: z.string().min(12, "Use at least 12 characters.").max(128),
        }).parse(data);
        if (data.password !== data.confirmPassword)
          throw new Error("Passwords must match.");
      }
      if (login || signup) {
        const result = await post(`/auth/${signup ? "register" : "login"}`, {
          ...data,
          terms: data.terms === "on",
        });
        await refresh();
        if (result.message) toast(result.message);
        navigate(verifiedReturn);
      } else if (mode === "forgot") {
        const r = await post("/auth/forgot-password", data);
        setDone(r.message);
      } else if (mode === "verify") {
        const r = await post("/auth/verify-email", {
          token: params.get("token"),
        });
        await refresh();
        setDone(r.message);
      } else {
        const r = await post("/auth/reset-password", {
          password: data.password,
          token: params.get("token"),
        });
        setDone(r.message);
      }
    } catch (e: any) {
      setError(e instanceof z.ZodError ? e.issues[0].message : e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Link className="text-link" to="/games">
          <ArrowLeft size={15} />
          Back to the playground
        </Link>
        <div>
          <span className="eyebrow">A LITTLE SHARPER. A LITTLE MORE YOU.</span>
          <h2>
            Good things
            <br />
            start with
            <br />
            <span>curiosity.</span>
          </h2>
          <p>
            A place to play, to discover, and to surprise yourself. Your mind
            will feel right at home.
          </p>
        </div>
        <Art game={games[0]} large />
        <div className="auth-story-bottom">
          <Hexagon size={18} />
          <span>20 games. Endless little discoveries.</span>
        </div>
      </div>
      <div className="auth-form-wrap">
        <span className="auth-mark">
          <Hexagon size={28} />
        </span>
        <h1>{title}</h1>
        <p>
          {login
            ? "Sign in and pick up where your curiosity left off."
            : signup
              ? "Join the hive. Save your progress. Find your next best."
              : mode === "forgot"
                ? "Enter your email and we’ll send a password reset link."
                : mode === "verify"
                  ? "Confirm your email to enable purchases and expansion unlocks."
                  : "Choose a password with at least 12 characters."}
        </p>
        {done ? (
          <div className="auth-success">
            <Check size={28} />
            <h3>{done}</h3>
            <Link
              className="button primary"
              to={mode === "verify" ? verifiedReturn : "/login"}
            >
              {mode === "verify" ? "Continue" : "Back to sign in"}
              <ArrowUpRight size={16} />
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="form">
            {signup && (
              <label>
                Display name
                <input
                  name="displayName"
                  required
                  minLength={2}
                  maxLength={32}
                  autoComplete="nickname"
                  placeholder="What should we call you?"
                />
              </label>
            )}
            {(login || signup || mode === "forgot") && (
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  maxLength={254}
                />
              </label>
            )}
            {(login || signup || mode === "reset") && (
              <label>
                <span>
                  Password
                  {login && <Link to="/forgot-password">Forgot password?</Link>}
                </span>
                <div className="password-field">
                  <input
                    name="password"
                    type={show ? "text" : "password"}
                    required
                    minLength={login ? 1 : 12}
                    maxLength={128}
                    autoComplete={login ? "current-password" : "new-password"}
                    placeholder={
                      login ? "Your password" : "At least 12 characters"
                    }
                  />
                  <button
                    type="button"
                    aria-label={show ? "Hide password" : "Show password"}
                    onClick={() => setShow(!show)}
                  >
                    {show ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
            )}
            {signup && (
              <>
                <label>
                  Confirm password
                  <input
                    name="confirmPassword"
                    type={show ? "text" : "password"}
                    required
                    minLength={12}
                    autoComplete="new-password"
                    placeholder="Once more, just to be sure"
                  />
                </label>
                <label className="honeypot" aria-hidden="true">
                  Website
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
                <label className="checkbox-label">
                  <input name="terms" type="checkbox" required />
                  <span>
                    I agree to the <Link to="/terms">Terms of Service</Link> and
                    acknowledge the <Link to="/privacy">Privacy Policy</Link>.
                  </span>
                </label>
              </>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy
                ? "Connecting…"
                : signup
                  ? "Create your free account"
                  : login
                    ? "Let’s get back to play"
                    : mode === "forgot"
                      ? "Send reset link"
                      : mode === "verify"
                        ? "Verify my email"
                        : "Update password"}
              {mode === "forgot" ? (
                <Mail size={16} />
              ) : (
                <ArrowUpRight size={16} />
              )}
            </button>
          </form>
        )}
        {!done && (login || signup) && (
          <p className="auth-switch">
            {signup ? "Already part of the hive?" : "New around here?"}{" "}
            <Link to={signup ? "/login" : "/signup"}>
              {signup ? "Sign in" : "Create a free account"}
              <ArrowUpRight size={13} />
            </Link>
          </p>
        )}
        <p className="auth-secure">
          <ShieldCheck size={14} />
          Your account. Your progress. Securely saved.
        </p>
      </div>
    </div>
  );
}

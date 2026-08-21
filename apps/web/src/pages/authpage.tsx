import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";
import { ApiClientError } from "../lib/api";

export function AuthPage() {
  const { user, login, register, syncProgress } = useAuth();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      if (mode === "login") {
        await login(String(data.get("email")), String(data.get("password")), data.get("rememberMe") === "on");
      } else if (mode === "register") {
        await register({
          fullName: String(data.get("fullName")),
          email: String(data.get("email")),
          password: String(data.get("password")),
          passwordConfirmation: String(data.get("passwordConfirmation"))
        });
      } else {
        setError("Password reset flow is available through the API. Email delivery is the next integration point.");
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors);
      } else {
        setError(err instanceof Error ? err.message : "Could not continue");
      }
    } finally {
      setBusy(false);
    }
  }

  function fieldError(name: string) {
    const messages = fieldErrors[name];
    return messages?.length ? messages.join(" ") : null;
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <form className="form-card" onSubmit={submit} noValidate>
          <img className="auth-brand-logo" src="/brand/logo-wordmark.png" alt="Cash Flow" />
          <div className="segmented">
            <button type="button" className={mode === "login" ? "selected" : ""} onClick={() => setMode("login")}>
              Login
            </button>
            <button type="button" className={mode === "register" ? "selected" : ""} onClick={() => setMode("register")}>
              Register
            </button>
            <button type="button" className={mode === "forgot" ? "selected" : ""} onClick={() => setMode("forgot")}>
              Reset
            </button>
          </div>
          {mode === "register" ? (
            <label>
              Full name
              <input name="fullName" minLength={2} aria-invalid={Boolean(fieldError("fullName"))} required />
              {fieldError("fullName") ? <span className="field-error">{fieldError("fullName")}</span> : null}
            </label>
          ) : null}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" aria-invalid={Boolean(fieldError("email"))} required />
            {fieldError("email") ? <span className="field-error">{fieldError("email")}</span> : null}
          </label>
          {mode !== "forgot" ? (
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                aria-invalid={Boolean(fieldError("password"))}
                required
              />
              {fieldError("password") ? <span className="field-error">{fieldError("password")}</span> : null}
            </label>
          ) : null}
          {mode === "register" ? (
            <>
              <label>
                Confirm password
                <input
                  name="passwordConfirmation"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(fieldError("passwordConfirmation"))}
                  required
                />
                {fieldError("passwordConfirmation") ? (
                  <span className="field-error">{fieldError("passwordConfirmation")}</span>
                ) : null}
              </label>
            </>
          ) : null}
          {mode === "login" ? (
            <label className="checkbox-row">
              <input name="rememberMe" type="checkbox" />
              Remember this device
            </label>
          ) : null}
          {error ? <div className="form-error">{error}</div> : null}
          {syncProgress ? (
            <div className="sync-progress" role="status" aria-live="polite">
              <div className="sync-progress-header">
                <span>{syncProgress.message}</span>
                <strong>{syncProgress.percent}%</strong>
              </div>
              <div className="sync-progress-track" aria-hidden="true">
                <span style={{ width: `${syncProgress.percent}%` }} />
              </div>
            </div>
          ) : null}
          <button className="primary-button" disabled={busy}>
            {syncProgress
              ? "Loading data..."
              : busy
                ? "Working..."
                : mode === "login"
                  ? "Sign in"
                  : mode === "register"
                    ? "Create account"
                    : "Send reset link"}
          </button>
        </form>
      </section>
    </main>
  );
}

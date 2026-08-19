import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";

export function AuthPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
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
      setError(err instanceof Error ? err.message : "Could not continue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="auth-copy">
          <p className="eyebrow">Private finance workspace</p>
          <h1>Cash Flow</h1>
          <p>
            Track daily spending, loans, assets, investments, and Zakat from one owner-scoped account. Mixed currencies
            stay separate until you provide exchange rates.
          </p>
        </div>
        <form className="form-card" onSubmit={submit}>
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
              <input name="fullName" minLength={2} required />
            </label>
          ) : null}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          {mode !== "forgot" ? (
            <label>
              Password
              <input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required />
            </label>
          ) : null}
          {mode === "register" ? (
            <>
              <label>
                Confirm password
                <input name="passwordConfirmation" type="password" autoComplete="new-password" required />
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
          <button className="primary-button" disabled={busy}>
            {busy ? "Working..." : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset link"}
          </button>
        </form>
      </section>
    </main>
  );
}

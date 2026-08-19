import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";
export function AuthPage() {
    const { user, login, register } = useAuth();
    const [mode, setMode] = useState("login");
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    if (user)
        return _jsx(Navigate, { to: "/", replace: true });
    async function submit(event) {
        event.preventDefault();
        setError(null);
        setBusy(true);
        const data = new FormData(event.currentTarget);
        try {
            if (mode === "login") {
                await login(String(data.get("email")), String(data.get("password")), data.get("rememberMe") === "on");
            }
            else if (mode === "register") {
                await register({
                    fullName: String(data.get("fullName")),
                    email: String(data.get("email")),
                    password: String(data.get("password")),
                    passwordConfirmation: String(data.get("passwordConfirmation"))
                });
            }
            else {
                setError("Password reset flow is available through the API. Email delivery is the next integration point.");
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Could not continue");
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsx("main", { className: "auth-screen", children: _jsxs("section", { className: "auth-panel", children: [_jsxs("div", { className: "auth-copy", children: [_jsx("p", { className: "eyebrow", children: "Private finance workspace" }), _jsx("h1", { children: "Cash Flow" }), _jsx("p", { children: "Track daily spending, loans, assets, investments, and Zakat from one owner-scoped account. Mixed currencies stay separate until you provide exchange rates." })] }), _jsxs("form", { className: "form-card", onSubmit: submit, children: [_jsxs("div", { className: "segmented", children: [_jsx("button", { type: "button", className: mode === "login" ? "selected" : "", onClick: () => setMode("login"), children: "Login" }), _jsx("button", { type: "button", className: mode === "register" ? "selected" : "", onClick: () => setMode("register"), children: "Register" }), _jsx("button", { type: "button", className: mode === "forgot" ? "selected" : "", onClick: () => setMode("forgot"), children: "Reset" })] }), mode === "register" ? (_jsxs("label", { children: ["Full name", _jsx("input", { name: "fullName", minLength: 2, required: true })] })) : null, _jsxs("label", { children: ["Email", _jsx("input", { name: "email", type: "email", autoComplete: "email", required: true })] }), mode !== "forgot" ? (_jsxs("label", { children: ["Password", _jsx("input", { name: "password", type: "password", autoComplete: mode === "login" ? "current-password" : "new-password", required: true })] })) : null, mode === "register" ? (_jsx(_Fragment, { children: _jsxs("label", { children: ["Confirm password", _jsx("input", { name: "passwordConfirmation", type: "password", autoComplete: "new-password", required: true })] }) })) : null, mode === "login" ? (_jsxs("label", { className: "checkbox-row", children: [_jsx("input", { name: "rememberMe", type: "checkbox" }), "Remember this device"] })) : null, error ? _jsx("div", { className: "form-error", children: error }) : null, _jsx("button", { className: "primary-button", disabled: busy, children: busy ? "Working..." : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset link" })] })] }) }));
}

import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useMemo, useState } from "react";
import { api, setAccessToken } from "../lib/api";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    function receiveSession(nextUser, nextToken) {
        setUser(nextUser);
        setToken(nextToken);
        setAccessToken(nextToken);
    }
    function clearSession() {
        setUser(null);
        setToken(null);
        setAccessToken(null);
    }
    const value = useMemo(() => ({
        user,
        token,
        async login(email, password, rememberMe) {
            const response = await api("/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password, rememberMe })
            });
            receiveSession(response.data.user, response.data.accessToken);
        },
        async register(input) {
            const response = await api("/auth/register", {
                method: "POST",
                body: JSON.stringify({ ...input, termsAccepted: true })
            });
            receiveSession(response.data.user, response.data.accessToken);
        },
        async logout() {
            await api("/auth/logout", { method: "POST" }).catch(() => undefined);
            clearSession();
        }
    }), [user, token]);
    return _jsx(AuthContext.Provider, { value: value, children: children });
}
export function useAuth() {
    const value = useContext(AuthContext);
    if (!value)
        throw new Error("useAuth must be used inside AuthProvider");
    return value;
}

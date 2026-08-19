import { createContext, useContext, useMemo, useState } from "react";
import { api, setAccessToken } from "../lib/api";

type User = {
  id: string;
  fullName: string;
  email: string;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  register: (input: {
    fullName: string;
    email: string;
    password: string;
    passwordConfirmation: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  function receiveSession(nextUser: User, nextToken: string) {
    setUser(nextUser);
    setToken(nextToken);
    setAccessToken(nextToken);
  }

  function clearSession() {
    setUser(null);
    setToken(null);
    setAccessToken(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      async login(email, password, rememberMe) {
        const response = await api<{ data: { user: User; accessToken: string } }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password, rememberMe })
        });
        receiveSession(response.data.user, response.data.accessToken);
      },
      async register(input) {
        const response = await api<{ data: { user: User; accessToken: string } }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({ ...input, termsAccepted: true })
        });
        receiveSession(response.data.user, response.data.accessToken);
      },
      async logout() {
        await api("/auth/logout", { method: "POST" }).catch(() => undefined);
        clearSession();
      }
    }),
    [user, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

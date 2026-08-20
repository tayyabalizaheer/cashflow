import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, setAccessToken } from "../lib/api";
import {
  bootstrapLocalData,
  resetLocalDatabase,
  type BootstrapProgress,
  type BootstrapSummary
} from "../lib/localSqlite";

type User = {
  id: string;
  fullName: string;
  email: string;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  initializing: boolean;
  syncProgress: BootstrapProgress | null;
  restoreSummary: BootstrapSummary | null;
  restoreOnlineData: () => Promise<void>;
  skipRestore: () => void;
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
  const [initializing, setInitializing] = useState(true);
  const [syncProgress, setSyncProgress] = useState<BootstrapProgress | null>(null);
  const [restoreSummary, setRestoreSummary] = useState<BootstrapSummary | null>(null);

  function receiveSession(nextUser: User, nextToken: string) {
    setUser(nextUser);
    setToken(nextToken);
    setAccessToken(nextToken);
  }

  function clearSession() {
    setUser(null);
    setToken(null);
    setAccessToken(null);
    setSyncProgress(null);
  }

  async function prepareRestore(nextUser: User, nextToken: string) {
    receiveSession(nextUser, nextToken);
    await resetLocalDatabase();
    try {
      const summary = await api<{ data: BootstrapSummary }>("/sync/summary");
      setRestoreSummary(summary.data);
    } catch (error) {
      setRestoreSummary({ total: 0, modules: [] });
      throw error;
    }
  }

  async function restoreOnlineData() {
    setSyncProgress({ percent: 1, message: "Preparing local database" });
    try {
      await bootstrapLocalData(setSyncProgress);
      setRestoreSummary(null);
    } finally {
      setSyncProgress(null);
    }
  }

  function skipRestore() {
    setRestoreSummary(null);
  }

  useEffect(() => {
    let active = true;
    async function refreshSession() {
      try {
        const response = await api<{ data: { user: User; accessToken: string } }>("/auth/refresh", {
          method: "POST"
        });
        if (active) receiveSession(response.data.user, response.data.accessToken);
      } catch {
        if (active) clearSession();
      } finally {
        if (active) setInitializing(false);
      }
    }

    void refreshSession();
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      initializing,
      syncProgress,
      restoreSummary,
      restoreOnlineData,
      skipRestore,
      async login(email, password, rememberMe) {
        const response = await api<{ data: { user: User; accessToken: string } }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password, rememberMe })
        });
        await prepareRestore(response.data.user, response.data.accessToken);
      },
      async register(input) {
        const response = await api<{ data: { user: User; accessToken: string } }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({ ...input, termsAccepted: true })
        });
        await prepareRestore(response.data.user, response.data.accessToken);
      },
      async logout() {
        await api("/auth/logout", { method: "POST" }).catch(() => undefined);
        clearSession();
      }
    }),
    [user, token, initializing, syncProgress, restoreSummary]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {user && restoreSummary ? <RestorePrompt /> : null}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

function RestorePrompt() {
  const { restoreSummary, syncProgress, restoreOnlineData, skipRestore } = useAuth();
  if (!restoreSummary) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Restore online data">
      <section className="modal-panel restore-panel">
        <div>
          <p className="eyebrow">Restore</p>
          <h2>Online data found</h2>
        </div>
        <p>{restoreSummary.total} record(s) are available on the server.</p>
        <div className="restore-count-grid">
          {restoreSummary.modules
            .filter((item) => item.count > 0)
            .map((item) => (
              <div key={item.module}>
                <span>{item.module}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
        </div>
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
        <div className="confirm-actions">
          <button className="secondary-button" type="button" onClick={skipRestore} disabled={Boolean(syncProgress)}>
            Skip
          </button>
          <button className="primary-button" type="button" onClick={restoreOnlineData} disabled={Boolean(syncProgress)}>
            Restore data
          </button>
        </div>
      </section>
    </div>
  );
}

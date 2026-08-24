import { appVersionHeader, registerApiAppVersion } from "./appversion";
import { API_URL } from "./config";
import {
  getAccessToken,
  sessionExpiredEvent,
  sessionRestoredEvent,
  setAccessToken,
} from "./sessiontoken";

type RefreshResponse = {
  data?: {
    accessToken?: string;
    user?: unknown;
  };
};

export type SessionRefreshResult =
  | { status: "restored"; accessToken: string; user?: unknown }
  | { status: "expired" }
  | { status: "unavailable" };

let refreshPromise: Promise<SessionRefreshResult> | null = null;

export function authHeaders() {
  const accessToken = getAccessToken();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export async function ensureAccessToken() {
  if (getAccessToken()) return true;
  const result = await restoreSessionFromRefreshToken();
  return result.status === "restored";
}

export async function refreshAccessToken() {
  const result = await restoreSessionFromRefreshToken();
  return result.status === "restored";
}

export async function restoreSessionFromRefreshToken() {
  refreshPromise ??= refreshSessionOnce().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function refreshSessionOnce(): Promise<SessionRefreshResult> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      setAccessToken(null);
      if (response.status === 401 || response.status === 403) {
        window.dispatchEvent(new CustomEvent(sessionExpiredEvent));
        return { status: "expired" };
      }
      return { status: "unavailable" };
    }

    registerApiAppVersion(response.headers.get(appVersionHeader));
    const body = (await response.json()) as RefreshResponse;
    const nextToken = body.data?.accessToken;
    if (!nextToken) return { status: "unavailable" };

    setAccessToken(nextToken);
    window.dispatchEvent(
      new CustomEvent(sessionRestoredEvent, {
        detail: body.data ?? {},
      }),
    );
    return {
      status: "restored",
      accessToken: nextToken,
      ...(body.data?.user ? { user: body.data.user } : {}),
    };
  } catch {
    return { status: "unavailable" };
  }
}

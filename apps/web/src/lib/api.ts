import { queueOfflineMutation } from "./offlinequeue";
import { appVersionHeader, registerApiAppVersion } from "./appversion";
import { API_URL } from "./config";
import {
  hasPendingLocalMutations,
  localResponseForPath,
  storeServerResponseForPath,
} from "./localsqlite";
import { getAccessToken, setAccessToken } from "./sessiontoken";
export { setAccessToken } from "./sessiontoken";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public fieldErrors: Record<string, string[]> = {},
    public code?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type ApiRequestOptions = RequestInit & {
  onlineOnly?: boolean;
  retryingAfterRefresh?: boolean;
};

const backgroundRefreshTtlMs = 30_000;
const recentBackgroundRefreshes = new Map<string, number>();
const pendingBackgroundRefreshes = new Set<string>();

export async function api<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    onlineOnly = false,
    retryingAfterRefresh = false,
    ...requestOptions
  } = options;
  const method = options.method?.toUpperCase() ?? "GET";
  const canQueue =
    method !== "GET" &&
    !path.startsWith("/auth/") &&
    !path.startsWith("/sync/");

  if (method === "GET" && !onlineOnly) {
    const local = await localResponseForPath(path);
    if (local) {
      scheduleBackgroundRefresh(path, requestOptions);
      return local as T;
    }
  }

  if (canQueue && !navigator.onLine) {
    const queuedMutation = await queueOfflineMutation({
      path,
      method,
      ...(typeof options.body === "string" ? { body: options.body } : {}),
    });
    return { data: queuedMutation.localData ?? { queued: true } } as T;
  }

  let response: Response;

  try {
    const accessToken = getAccessToken();
    response = await fetch(`${API_URL}${path}`, {
      ...requestOptions,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...requestOptions.headers,
      },
    });
    registerApiAppVersion(response.headers.get(appVersionHeader));
  } catch (error) {
    if (canQueue) {
      const queuedMutation = await queueOfflineMutation({
        path,
        method,
        ...(typeof options.body === "string" ? { body: options.body } : {}),
      });
      return { data: queuedMutation.localData ?? { queued: true } } as T;
    }
    if (method === "GET" && !onlineOnly) {
      const local = await localResponseForPath(path);
      if (local) return local as T;
    }
    throw error;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const code = body?.error?.code;
    if (
      response.status === 401 &&
      code === "UNAUTHORIZED" &&
      !path.startsWith("/auth/")
    ) {
      if (!retryingAfterRefresh && (await refreshAccessToken())) {
        return api<T>(path, { ...options, retryingAfterRefresh: true });
      }

      if (canQueue) {
        const queuedMutation = await queueOfflineMutation({
          path,
          method,
          ...(typeof options.body === "string" ? { body: options.body } : {}),
        });
        return { data: queuedMutation.localData ?? { queued: true } } as T;
      }

      if (method === "GET" && !onlineOnly) {
        const local = await localResponseForPath(path);
        if (local) return local as T;
      }
    }
    throw new ApiClientError(
      body?.error?.message ?? "Request failed",
      body?.error?.details?.fieldErrors ?? {},
      body?.error?.code,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

function apiHeaders(requestOptions: RequestInit) {
  const accessToken = getAccessToken();
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...requestOptions.headers,
  };
}

function scheduleBackgroundRefresh(path: string, requestOptions: RequestInit) {
  if (!navigator.onLine) return;
  if (pendingBackgroundRefreshes.has(path)) return;

  const lastRefresh = recentBackgroundRefreshes.get(path) ?? 0;
  if (Date.now() - lastRefresh < backgroundRefreshTtlMs) return;

  recentBackgroundRefreshes.set(path, Date.now());
  pendingBackgroundRefreshes.add(path);
  void refreshServerData(path, requestOptions).finally(() => {
    pendingBackgroundRefreshes.delete(path);
  });
}

async function refreshServerData(path: string, requestOptions: RequestInit) {
  if (await hasPendingLocalMutations()) return;

  const backgroundOptions = { ...requestOptions };
  delete backgroundOptions.signal;
  const body = await fetchServerJson(path, backgroundOptions);
  if (!body) return;

  const stored = await storeServerResponseForPath(path, body);
  if (!stored) return;

  window.dispatchEvent(
    new CustomEvent("cash-flow:local-data-refreshed", {
      detail: { path },
    }),
  );
}

async function fetchServerJson(path: string, requestOptions: RequestInit) {
  try {
    let response = await fetch(`${API_URL}${path}`, {
      ...requestOptions,
      credentials: "include",
      headers: apiHeaders(requestOptions),
    });
    registerApiAppVersion(response.headers.get(appVersionHeader));

    if (
      response.status === 401 &&
      !path.startsWith("/auth/") &&
      (await refreshAccessToken())
    ) {
      response = await fetch(`${API_URL}${path}`, {
        ...requestOptions,
        credentials: "include",
        headers: apiHeaders(requestOptions),
      });
      registerApiAppVersion(response.headers.get(appVersionHeader));
    }

    if (!response.ok || response.status === 204) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function refreshAccessToken() {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      setAccessToken(null);
      return false;
    }
    registerApiAppVersion(response.headers.get(appVersionHeader));
    const body = (await response.json()) as {
      data?: { accessToken?: string; user?: unknown };
    };
    const nextToken = body.data?.accessToken;
    if (!nextToken) return false;
    setAccessToken(nextToken);
    window.dispatchEvent(
      new CustomEvent("cash-flow:session-restored", {
        detail: body.data ?? {},
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function formatCurrency(
  value: number | string,
  currency = "USD",
  locale = "en-US",
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

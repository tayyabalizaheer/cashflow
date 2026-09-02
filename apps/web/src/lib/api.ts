import { queueOfflineMutation } from "./offlinequeue";
import { appVersionHeader, registerApiAppVersion } from "./appversion";
import {
  authHeaders,
  ensureAccessToken,
  refreshAccessToken,
} from "./authsession";
import { API_URL } from "./config";
import {
  applySuccessfulMutationToLocal,
  hasPendingLocalMutations,
  localResponseForPath,
  storeServerResponseForPath,
} from "./localsqlite";
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
let optimisticWriteRefreshBlockedUntil = 0;

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
    !onlineOnly &&
    method !== "GET" &&
    !path.startsWith("/auth/") &&
    !path.startsWith("/sync/");
  const mutationCanChangeTrash =
    canQueue && (method === "DELETE" || path.startsWith("/trash/"));
  const needsSession = !path.startsWith("/auth/");

  if (method === "GET" && !onlineOnly) {
    const local = await localResponseForPath(path);
    if (local) {
      scheduleBackgroundRefresh(path, requestOptions);
      return local as T;
    }
  }

  if (mutationCanChangeTrash) {
    optimisticWriteRefreshBlockedUntil = Date.now() + 10_000;
  }

  if (canQueue && method === "DELETE") {
    await applySuccessfulMutationToLocal({
      path,
      method,
      ...(typeof options.body === "string" ? { body: options.body } : {}),
    });
    notifyLocalDataChanged(path);
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
    if (needsSession) {
      await ensureAccessToken();
    }
    response = await fetch(`${API_URL}${path}`, {
      ...requestOptions,
      ...(method === "GET" ? { cache: "no-store" as const } : {}),
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(method === "GET"
          ? { "Cache-Control": "no-cache", Pragma: "no-cache" }
          : {}),
        ...authHeaders(),
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
    if (canQueue) {
      if (!mutationCanChangeTrash) optimisticWriteRefreshBlockedUntil = 0;
      await applySuccessfulMutationToLocal({
        path,
        method,
        ...(typeof options.body === "string" ? { body: options.body } : {}),
      });
      notifyLocalDataChanged(path);
    }
    return undefined as T;
  }

  const body = await response.json();
  if (canQueue) {
    if (!mutationCanChangeTrash) optimisticWriteRefreshBlockedUntil = 0;
    const stored = await storeServerResponseForPath(path, body, {
      allowWithPendingMutations: true,
    });
    if (!stored) {
      await applySuccessfulMutationToLocal(
        {
          path,
          method,
          ...(typeof options.body === "string" ? { body: options.body } : {}),
        },
        body,
      );
    }
    notifyLocalDataChanged(path);
  }
  return body;
}

function apiHeaders(requestOptions: RequestInit) {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    ...authHeaders(),
    ...requestOptions.headers,
  };
}

function scheduleBackgroundRefresh(path: string, requestOptions: RequestInit) {
  if (pendingBackgroundRefreshes.has(path)) return;

  const lastRefresh = recentBackgroundRefreshes.get(path) ?? 0;
  if (Date.now() - lastRefresh < backgroundRefreshTtlMs) return;

  recentBackgroundRefreshes.set(path, Date.now());
  pendingBackgroundRefreshes.add(path);
  void refreshServerData(path, requestOptions)
    .then((refreshed) => {
      if (!refreshed) recentBackgroundRefreshes.delete(path);
    })
    .finally(() => {
      pendingBackgroundRefreshes.delete(path);
    });
}

async function refreshServerData(path: string, requestOptions: RequestInit) {
  if (await hasPendingLocalMutations()) return false;
  if (Date.now() < optimisticWriteRefreshBlockedUntil) return false;
  if (!(await ensureAccessToken())) return false;

  const backgroundOptions = { ...requestOptions };
  delete backgroundOptions.signal;
  const body = await fetchServerJson(path, backgroundOptions);
  if (!body) return false;
  if (Date.now() < optimisticWriteRefreshBlockedUntil) return false;

  const stored = await storeServerResponseForPath(path, body);
  if (!stored) return false;

  notifyLocalDataChanged(path);
  return true;
}

function notifyLocalDataChanged(path: string) {
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
      cache: "no-store",
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
        cache: "no-store",
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

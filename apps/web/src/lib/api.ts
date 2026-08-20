import { queueOfflineMutation } from "./offlineQueue";
import { appVersionHeader, registerApiAppVersion } from "./appVersion";
import { API_URL } from "./config";
import { localResponseForPath } from "./localSqlite";
import { getAccessToken } from "./sessionToken";
export { setAccessToken } from "./sessionToken";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public fieldErrors: Record<string, string[]> = {},
    public code?: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type ApiRequestOptions = RequestInit & {
  onlineOnly?: boolean;
};

export async function api<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { onlineOnly = false, ...requestOptions } = options;
  const method = options.method?.toUpperCase() ?? "GET";
  const canQueue =
    method !== "GET" && !path.startsWith("/auth/") && !path.startsWith("/sync/");
  if (method === "GET" && !onlineOnly && !navigator.onLine) {
    const local = await localResponseForPath(path);
    if (local) return local as T;
  }

  if (canQueue && !navigator.onLine) {
    const queuedMutation = await queueOfflineMutation({
      path,
      method,
      ...(typeof options.body === "string" ? { body: options.body } : {})
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
        ...requestOptions.headers
      }
    });
    registerApiAppVersion(response.headers.get(appVersionHeader));
  } catch (error) {
    if (canQueue) {
      const queuedMutation = await queueOfflineMutation({
        path,
        method,
        ...(typeof options.body === "string" ? { body: options.body } : {})
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
    throw new ApiClientError(
      body?.error?.message ?? "Request failed",
      body?.error?.details?.fieldErrors ?? {},
      body?.error?.code
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export function formatCurrency(value: number | string, currency = "USD", locale = "en-US") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(Number(value));
}

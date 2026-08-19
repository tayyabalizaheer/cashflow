import { queueOfflineMutation } from "./offlineQueue";
import { API_URL } from "./config";
import { getAccessToken } from "./sessionToken";
export { setAccessToken } from "./sessionToken";
export async function api(path, options = {}) {
    const method = options.method?.toUpperCase() ?? "GET";
    const canQueue = method !== "GET" && !path.startsWith("/auth/") && !path.startsWith("/sync/");
    let response;
    try {
        const accessToken = getAccessToken();
        response = await fetch(`${API_URL}${path}`, {
            ...options,
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                ...options.headers
            }
        });
    }
    catch (error) {
        if (canQueue) {
            const queuedMutation = {
                path,
                method,
                ...(typeof options.body === "string" ? { body: options.body } : {})
            };
            await queueOfflineMutation(queuedMutation);
            return { data: { queued: true } };
        }
        throw error;
    }
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Request failed");
    }
    if (response.status === 204) {
        return undefined;
    }
    return response.json();
}
export function formatCurrency(value, currency = "USD", locale = "en-US") {
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 2
    }).format(Number(value));
}

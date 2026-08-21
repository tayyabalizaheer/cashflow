import { API_URL } from "./config";
import { getAccessToken } from "./sessiontoken";
import { listLocalMutations, queueLocalMutation, removeLocalMutation } from "./localsqlite";
import type { OfflineMutation } from "./localsqlite";
export type { OfflineMutation } from "./localsqlite";

let flushPromise: Promise<{ pushed: number }> | null = null;

export async function queueOfflineMutation(input: Pick<OfflineMutation, "path" | "method" | "body">) {
  return queueLocalMutation(input);
}

export async function listOfflineMutations() {
  return listLocalMutations();
}

export async function removeOfflineMutation(id: string) {
  await removeLocalMutation(id);
}

export async function flushOfflineMutations() {
  if (flushPromise) return flushPromise;
  flushPromise = flushOfflineMutationsOnce().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}

async function flushOfflineMutationsOnce() {
  const token = getAccessToken();
  if (!token || !navigator.onLine) return { pushed: 0 };

  const mutations = await listOfflineMutations();
  let pushed = 0;

  for (const mutation of mutations) {
    const requestInit: RequestInit = {
      method: mutation.method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": mutation.id
      },
      ...(mutation.body ? { body: mutation.body } : {})
    };
    const response = await fetch(`${API_URL}${mutation.path}`, requestInit);

    if (!response.ok) {
      break;
    }

    await removeOfflineMutation(mutation.id);
    pushed += 1;
  }

  return { pushed };
}

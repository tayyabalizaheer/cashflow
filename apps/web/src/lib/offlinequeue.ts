import { API_URL } from "./config";
import { appVersionHeader, registerApiAppVersion } from "./appversion";
import {
  authHeaders,
  ensureAccessToken,
  refreshAccessToken,
} from "./authsession";
import {
  listLocalMutations,
  queueLocalMutation,
  removeLocalMutation,
} from "./localsqlite";
import type { OfflineMutation } from "./localsqlite";
export type { OfflineMutation } from "./localsqlite";

let flushPromise: Promise<{ pushed: number }> | null = null;

export async function queueOfflineMutation(
  input: Pick<OfflineMutation, "path" | "method" | "body">,
) {
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
  if (!navigator.onLine) return { pushed: 0 };
  if (!(await ensureAccessToken())) return { pushed: 0 };

  const mutations = await listOfflineMutations();
  let pushed = 0;

  for (const mutation of mutations) {
    let response = await sendMutation(mutation);

    if (response.status === 401 && (await refreshAccessToken())) {
      response = await sendMutation(mutation);
    }

    if (!response.ok) {
      break;
    }

    await removeOfflineMutation(mutation.id);
    pushed += 1;
  }

  if (pushed > 0) {
    window.dispatchEvent(
      new CustomEvent("cash-flow:offline-sync-flushed", {
        detail: { pushed },
      }),
    );
  }

  return { pushed };
}

function mutationHeaders(mutationId: string) {
  return {
    "Content-Type": "application/json",
    ...authHeaders(),
    "Idempotency-Key": mutationId,
  };
}

async function sendMutation(mutation: OfflineMutation) {
  const response = await fetch(`${API_URL}${mutation.path}`, {
    method: mutation.method,
    credentials: "include",
    headers: mutationHeaders(mutation.id),
    ...(mutation.body ? { body: mutation.body } : {}),
  });
  registerApiAppVersion(response.headers.get(appVersionHeader));
  return response;
}

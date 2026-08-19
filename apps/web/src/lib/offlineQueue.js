import { API_URL } from "./config";
import { getAccessToken } from "./sessionToken";
const dbName = "cash-flow-offline";
const storeName = "mutation_queue";
function openOfflineDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: "id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
async function withStore(mode, callback) {
    const db = await openOfflineDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = callback(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
            db.close();
            reject(transaction.error);
        };
    });
}
export async function queueOfflineMutation(input) {
    const mutation = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...input
    };
    await withStore("readwrite", (store) => store.put(mutation));
    return mutation;
}
export async function listOfflineMutations() {
    return withStore("readonly", (store) => store.getAll());
}
export async function removeOfflineMutation(id) {
    await withStore("readwrite", (store) => store.delete(id));
}
export async function flushOfflineMutations() {
    const token = getAccessToken();
    if (!token || !navigator.onLine)
        return { pushed: 0 };
    const mutations = await listOfflineMutations();
    let pushed = 0;
    for (const mutation of mutations) {
        const requestInit = {
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

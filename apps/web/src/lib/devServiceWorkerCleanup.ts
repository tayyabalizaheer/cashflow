export function cleanupDevServiceWorkers() {
  if (!import.meta.env.DEV || !("serviceWorker" in navigator)) return;

  void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    if (registrations.length === 0) return;

    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ("caches" in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
    }

    const reloadKey = "cash-flow-dev-sw-cleaned";
    if (navigator.serviceWorker.controller && !sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, "true");
      window.location.reload();
    }
  });
}

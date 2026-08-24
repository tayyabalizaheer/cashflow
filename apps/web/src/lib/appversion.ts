export const appVersionHeader = "X-Cash-Flow-Version";
export const appVersionUpdateEvent = "cash-flow-version-update";

const currentVersionKey = "cash-flow-current-version";
const latestVersionKey = "cash-flow-latest-version";
const dismissedVersionKey = "cash-flow-dismissed-version";

export type AppVersionUpdateDetail = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
};

export const appDisplayVersion = __APP_VERSION__;
export const currentAppBuildNumber = __APP_BUILD_NUMBER__;
export const currentAppVersion = currentAppBuildNumber;

export function versionedAssetUrl(url: string) {
  if (currentAppVersion === "development") return url;
  return `${url}${url.includes("?") ? "&" : "?"}${currentAppVersion}`;
}

export function rememberCurrentAppVersion() {
  localStorage.setItem(currentVersionKey, currentAppVersion);
}

export function registerApiAppVersion(latestVersion: string | null) {
  const isNonBuildDevelopmentHeader =
    latestVersion === "development" && currentAppVersion !== "development";
  if (
    !latestVersion ||
    latestVersion === currentAppVersion ||
    isNonBuildDevelopmentHeader
  ) {
    rememberCurrentAppVersion();
    localStorage.removeItem(latestVersionKey);
    window.dispatchEvent(
      new CustomEvent<AppVersionUpdateDetail>(appVersionUpdateEvent, {
        detail: {
          currentVersion: currentAppVersion,
          latestVersion: null,
          updateAvailable: false,
        },
      }),
    );
    return;
  }

  localStorage.setItem(latestVersionKey, latestVersion);
  window.dispatchEvent(
    new CustomEvent<AppVersionUpdateDetail>(appVersionUpdateEvent, {
      detail: {
        currentVersion: currentAppVersion,
        latestVersion,
        updateAvailable: true,
      },
    }),
  );
}

export function getStoredLatestAppVersion() {
  const latestVersion = localStorage.getItem(latestVersionKey);
  return latestVersion && latestVersion !== currentAppVersion
    ? latestVersion
    : null;
}

export function dismissLatestAppVersion(latestVersion: string | null) {
  localStorage.setItem(
    dismissedVersionKey,
    latestVersion ?? `service-worker:${currentAppVersion}`,
  );
}

export function isLatestAppVersionDismissed(latestVersion: string | null) {
  const dismissedVersion = localStorage.getItem(dismissedVersionKey);
  const versionKey = latestVersion ?? `service-worker:${currentAppVersion}`;
  return dismissedVersion === versionKey;
}

export async function clearAppCacheAndRestart() {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) =>
        registration.update().catch(() => undefined),
      ),
    );
    await Promise.all(
      registrations.map((registration) =>
        registration.unregister().catch(() => false),
      ),
    );
  }

  if ("caches" in window) {
    const cacheNames = await window.caches.keys();
    await Promise.all(
      cacheNames.map((cacheName) => window.caches.delete(cacheName)),
    );
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("appRestart", Date.now().toString());
  window.location.replace(nextUrl.toString());
}

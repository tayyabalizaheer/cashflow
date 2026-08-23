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

export const currentAppVersion = __APP_BUILD_NUMBER__;

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

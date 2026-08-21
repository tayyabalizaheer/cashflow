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

export function rememberCurrentAppVersion() {
  localStorage.setItem(currentVersionKey, currentAppVersion);
}

export function registerApiAppVersion(latestVersion: string | null) {
  if (!latestVersion || latestVersion === currentAppVersion) {
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
  if (latestVersion) {
    localStorage.setItem(dismissedVersionKey, latestVersion);
  }
}

export function isLatestAppVersionDismissed(latestVersion: string | null) {
  return Boolean(
    latestVersion && localStorage.getItem(dismissedVersionKey) === latestVersion,
  );
}

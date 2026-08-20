export const appVersionHeader = "X-Cash-Flow-Version";
export const appVersionUpdateEvent = "cash-flow-version-update";

const currentVersionKey = "cash-flow-current-version";
const latestVersionKey = "cash-flow-latest-version";

export type AppVersionUpdateDetail = {
  currentVersion: string;
  latestVersion: string;
};

export const currentAppVersion = __APP_BUILD_NUMBER__;

export function rememberCurrentAppVersion() {
  localStorage.setItem(currentVersionKey, currentAppVersion);
}

export function registerApiAppVersion(latestVersion: string | null) {
  if (!latestVersion || latestVersion === currentAppVersion) {
    rememberCurrentAppVersion();
    localStorage.removeItem(latestVersionKey);
    return;
  }

  localStorage.setItem(latestVersionKey, latestVersion);
  window.dispatchEvent(
    new CustomEvent<AppVersionUpdateDetail>(appVersionUpdateEvent, {
      detail: {
        currentVersion: currentAppVersion,
        latestVersion,
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

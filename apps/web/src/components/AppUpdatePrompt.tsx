import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  appVersionUpdateEvent,
  currentAppVersion,
  dismissLatestAppVersion,
  getStoredLatestAppVersion,
  isLatestAppVersionDismissed,
  rememberCurrentAppVersion,
  type AppVersionUpdateDetail,
} from "../lib/appVersion";

type BuildInfo = {
  buildNumber?: string;
  builtAt?: string;
};

export function AppUpdatePrompt() {
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [latestBuildNumber, setLatestBuildNumber] = useState<string | null>(
    null
  );
  const [buildUpdateAvailable, setBuildUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW(_scriptUrl, swRegistration) {
      setRegistration(swRegistration ?? null);
      void swRegistration?.update();
    },
    onNeedRefresh() {
      setDismissed(false);
    },
    onRegisterError(error) {
      console.error("Service worker registration failed", error);
    }
  });

  useEffect(() => {
    let cancelled = false;
    rememberCurrentAppVersion();

    const storedLatestVersion = getStoredLatestAppVersion();
    if (
      storedLatestVersion &&
      !isLatestAppVersionDismissed(storedLatestVersion)
    ) {
      setLatestBuildNumber(storedLatestVersion);
      setBuildUpdateAvailable(true);
    }

    function handleApiVersionUpdate(event: Event) {
      const { latestVersion, updateAvailable } = (
        event as CustomEvent<AppVersionUpdateDetail>
      ).detail;
      if (!updateAvailable) {
        setLatestBuildNumber(null);
        setBuildUpdateAvailable(false);
        setDismissed(false);
        return;
      }
      if (isLatestAppVersionDismissed(latestVersion)) return;
      setLatestBuildNumber(latestVersion);
      setBuildUpdateAvailable(true);
      setDismissed(false);
      void registration?.update();
    }

    async function checkForBuildUpdate() {
      if (!navigator.onLine) return;

      try {
        const response = await fetch(`/build.json?check=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" }
        });

        if (!response.ok) return;

        const buildInfo = (await response.json()) as BuildInfo;
        if (
          !cancelled &&
          buildInfo.buildNumber &&
          buildInfo.buildNumber !== currentAppVersion
        ) {
          if (isLatestAppVersionDismissed(buildInfo.buildNumber)) return;
          setLatestBuildNumber(buildInfo.buildNumber);
          setBuildUpdateAvailable(true);
          setDismissed(false);
          void registration?.update();
        }
      } catch {
        // Missing build metadata is expected while running the Vite dev server.
      }
    }

    function checkWhenVisible() {
      if (document.visibilityState === "visible") {
        void checkForBuildUpdate();
      }
    }

    void checkForBuildUpdate();
    window.addEventListener(appVersionUpdateEvent, handleApiVersionUpdate);
    window.addEventListener("focus", checkForBuildUpdate);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      cancelled = true;
      window.removeEventListener(appVersionUpdateEvent, handleApiVersionUpdate);
      window.removeEventListener("focus", checkForBuildUpdate);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [registration]);

  const showPrompt =
    !dismissed &&
    !isLatestAppVersionDismissed(latestBuildNumber) &&
    (needRefresh || buildUpdateAvailable);

  async function applyUpdate() {
    setUpdating(true);

    if (needRefresh) {
      await updateServiceWorker(true);
      return;
    }

    await registration?.update();
    window.location.reload();
  }

  if (!showPrompt) return null;

  return (
    <div
      className="app-update-prompt"
      role="dialog"
      aria-live="polite"
      aria-labelledby="app-update-title"
    >
      <div className="app-update-copy">
        <strong id="app-update-title">Update available</strong>
        <span>
          Build {currentAppVersion}
          {latestBuildNumber ? ` -> ${latestBuildNumber}` : ""} is ready.
        </span>
      </div>
      <div className="app-update-actions">
        <button
          className="primary-button compact"
          type="button"
          onClick={applyUpdate}
          disabled={updating}
        >
          <RefreshCw size={17} />
          <span>{updating ? "Restarting" : "Update and restart"}</span>
        </button>
        <button
          className="icon-button app-update-close"
          type="button"
          onClick={() => {
            dismissLatestAppVersion(latestBuildNumber);
            setDismissed(true);
            setBuildUpdateAvailable(false);
            setNeedRefresh(false);
          }}
          title="Dismiss update"
          aria-label="Dismiss update"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

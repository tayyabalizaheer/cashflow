import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

type BuildInfo = {
  buildNumber?: string;
  builtAt?: string;
};

const currentBuildNumber = __APP_BUILD_NUMBER__;

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
          buildInfo.buildNumber !== currentBuildNumber
        ) {
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
    window.addEventListener("focus", checkForBuildUpdate);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", checkForBuildUpdate);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [registration]);

  const showPrompt = !dismissed && (needRefresh || buildUpdateAvailable);

  async function applyUpdate() {
    setUpdating(true);

    if (needRefresh) {
      await updateServiceWorker(true);
      return;
    }

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
          Build {currentBuildNumber}
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
          <span>{updating ? "Updating" : "Update"}</span>
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={() => {
            setDismissed(true);
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

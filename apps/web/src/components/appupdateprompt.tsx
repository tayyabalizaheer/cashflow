import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  appVersionUpdateEvent,
  currentAppVersion,
  rememberCurrentAppVersion,
  type AppVersionUpdateDetail,
} from "../lib/appversion";

type BuildInfo = {
  buildNumber?: string;
  builtAt?: string;
};

export function AppUpdatePrompt() {
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);

  useRegisterSW({
    immediate: true,
    onRegisteredSW(_scriptUrl, swRegistration) {
      setRegistration(swRegistration ?? null);
      void swRegistration?.update();
    },
    onRegisterError(error) {
      console.error("Service worker registration failed", error);
    },
  });

  useEffect(() => {
    let cancelled = false;
    rememberCurrentAppVersion();

    async function checkForBuildUpdate() {
      if (!navigator.onLine) return;

      try {
        const response = await fetch(`/build.json?check=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });

        if (!response.ok) return;

        const buildInfo = (await response.json()) as BuildInfo;
        if (
          !cancelled &&
          buildInfo.buildNumber &&
          buildInfo.buildNumber !== currentAppVersion
        ) {
          void registration?.update();
        }
      } catch {
        // Missing build metadata is expected while running the Vite dev server.
      }
    }

    function handleApiVersionUpdate(event: Event) {
      const { updateAvailable } = (
        event as CustomEvent<AppVersionUpdateDetail>
      ).detail;
      if (updateAvailable) void registration?.update();
    }

    function checkWhenVisible() {
      if (document.visibilityState === "visible") {
        void checkForBuildUpdate();
      }
    }

    function checkWhenFocused() {
      void checkForBuildUpdate();
    }

    void checkForBuildUpdate();
    window.addEventListener(appVersionUpdateEvent, handleApiVersionUpdate);
    window.addEventListener("focus", checkWhenFocused);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      cancelled = true;
      window.removeEventListener(appVersionUpdateEvent, handleApiVersionUpdate);
      window.removeEventListener("focus", checkWhenFocused);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [registration]);

  return null;
}

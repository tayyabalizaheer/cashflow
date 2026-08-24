import { useEffect } from "react";
import { flushOfflineMutations } from "./offlinequeue";

export function useOnlineSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const sync = () => {
      void flushOfflineMutations()
        .catch(() => ({ pushed: 0 }))
        .then((result) => {
          window.dispatchEvent(
            new CustomEvent("cash-flow:online-sync-checked", {
              detail: result,
            }),
          );
        });
    };
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") sync();
    };

    sync();
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", syncWhenVisible);
    const interval = window.setInterval(sync, 60_000);

    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.clearInterval(interval);
    };
  }, [enabled]);
}

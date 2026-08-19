import { useEffect } from "react";
import { flushOfflineMutations } from "./offlineQueue";
export function useOnlineSync(enabled) {
    useEffect(() => {
        if (!enabled)
            return;
        void flushOfflineMutations();
        const sync = () => {
            void flushOfflineMutations();
        };
        window.addEventListener("online", sync);
        const interval = window.setInterval(sync, 60_000);
        return () => {
            window.removeEventListener("online", sync);
            window.clearInterval(interval);
        };
    }, [enabled]);
}

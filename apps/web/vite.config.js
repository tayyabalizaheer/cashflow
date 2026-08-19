import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: "prompt",
            includeAssets: ["icons/icon.svg"],
            manifest: {
                name: "Cash Flow",
                short_name: "Cash Flow",
                description: "Personal finance, Zakat, assets, investments, and loans.",
                theme_color: "#0f5f5c",
                background_color: "#f7faf8",
                display: "standalone",
                start_url: "/",
                icons: [
                    {
                        src: "/icons/icon.svg",
                        sizes: "any",
                        type: "image/svg+xml",
                        purpose: "any maskable"
                    }
                ]
            },
            workbox: {
                navigateFallback: "/offline",
                runtimeCaching: [
                    {
                        urlPattern: ({ request }) => request.destination === "document",
                        handler: "NetworkFirst",
                        options: { cacheName: "cash-flow-pages" }
                    },
                    {
                        urlPattern: ({ request, url }) => request.method === "GET" && url.pathname.startsWith("/api/v1/") && !url.pathname.includes("/auth/"),
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "cash-flow-readonly-api",
                            expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 }
                        }
                    }
                ]
            }
        })
    ],
    server: {
        port: 5173
    }
});

import fs from "node:fs/promises";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const buildNumber = getBuildNumber();

function getBuildNumber() {
    const rawBuildNumber = process.env.VITE_APP_BUILD_NUMBER ??
        process.env.BUILD_NUMBER ??
        process.env.GITHUB_RUN_NUMBER ??
        process.env.GITHUB_SHA;
    const value = rawBuildNumber?.trim() ??
        (process.env.NODE_ENV === "development"
            ? "development"
            : new Date().toISOString().replace(/\D/g, "").slice(0, 14));
    return value.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

function buildNumberPlugin(value) {
    let config;
    return {
        name: "cash-flow-build-number",
        apply: "build",
        enforce: "post",
        configResolved(resolvedConfig) {
            config = resolvedConfig;
        },
        async closeBundle() {
            const outDir = path.resolve(config.root, config.build.outDir);
            const indexPath = path.join(outDir, "index.html");
            const swPath = path.join(outDir, "sw.js");
            const buildInfo = `${JSON.stringify({
                buildNumber: value,
                builtAt: new Date().toISOString()
            }, null, 2)}\n`;
            await fs.writeFile(path.join(outDir, "build.json"), buildInfo);
            try {
                const html = await fs.readFile(indexPath, "utf8");
                await fs.writeFile(indexPath, appendBuildNumberToHtml(html, value));
            }
            catch (error) {
                this.warn(`Unable to attach build number to index.html: ${error}`);
            }
            try {
                const serviceWorker = await fs.readFile(swPath, "utf8");
                if (!serviceWorker.includes("ignoreURLParametersMatching")) {
                    await fs.writeFile(swPath, serviceWorker.replace(/(precacheAndRoute\(\[[\s\S]*?\],)\{\}\)/, "$1{ignoreURLParametersMatching:[/^[a-zA-Z0-9_.-]+$/]})"));
                }
            }
            catch (error) {
                this.warn(`Unable to update service worker cache matching: ${error}`);
            }
        }
    };
}

function appendBuildNumberToHtml(html, value) {
    return html.replace(/\b(src|href)=(["'])([^"']+\.(?:js|css))(?:\?[^"']*)?\2/g, (_match, attribute, quote, url) => {
        if (/^(?:https?:)?\/\//.test(url)) {
            return `${attribute}=${quote}${url}${quote}`;
        }
        return `${attribute}=${quote}${url}?${value}${quote}`;
    });
}

export default defineConfig({
    define: {
        __APP_BUILD_NUMBER__: JSON.stringify(buildNumber)
    },
    plugins: [
        react(),
        VitePWA({
            injectRegister: false,
            registerType: "prompt",
            includeAssets: [
                "icons/favicon.png",
                "icons/icon-192.png",
                "icons/icon-512.png",
                "brand/logo-wordmark.png",
                "sql-wasm.wasm"
            ],
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
                        src: "/icons/icon-192.png",
                        sizes: "192x192",
                        type: "image/png",
                        purpose: "any maskable"
                    },
                    {
                        src: "/icons/icon-512.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "any maskable"
                    }
                ]
            },
            workbox: {
                cleanupOutdatedCaches: true,
                globIgnores: ["**/build.json"],
                ignoreURLParametersMatching: [/^[a-zA-Z0-9_.-]+$/],
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
        }),
        buildNumberPlugin(buildNumber)
    ],
    server: {
        port: 5173
    }
});

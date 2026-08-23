import fs from "node:fs/promises";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type ResolvedConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const buildNumber = getBuildNumber();

function getBuildNumber() {
  const rawBuildNumber =
    process.env.VITE_APP_BUILD_NUMBER ??
    process.env.BUILD_NUMBER ??
    process.env.GITHUB_RUN_NUMBER ??
    process.env.GITHUB_SHA;

  const value =
    rawBuildNumber?.trim() ??
    (process.env.NODE_ENV === "development"
      ? "development"
      : new Date().toISOString().replace(/\D/g, "").slice(0, 14));

  return value.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

function buildNumberPlugin(value: string): Plugin {
  let config: ResolvedConfig;

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
      const buildInfo = `${JSON.stringify(
        {
          buildNumber: value,
          builtAt: new Date().toISOString()
        },
        null,
        2
      )}\n`;

      await fs.writeFile(path.join(outDir, "build.json"), buildInfo);
      await fs.writeFile(
        path.join(outDir, "manifest-light.webmanifest"),
        `${JSON.stringify(themedManifest(value, "light"))}\n`
      );
      await fs.writeFile(
        path.join(outDir, "manifest-dark.webmanifest"),
        `${JSON.stringify(themedManifest(value, "dark"))}\n`
      );

      try {
        const html = await fs.readFile(indexPath, "utf8");
        await fs.writeFile(indexPath, appendBuildNumberToHtml(html, value));
      } catch (error) {
        this.warn(`Unable to attach build number to index.html: ${error}`);
      }

      try {
        const serviceWorker = await fs.readFile(swPath, "utf8");
        if (!serviceWorker.includes("ignoreURLParametersMatching")) {
          await fs.writeFile(
            swPath,
            serviceWorker.replace(
              /(precacheAndRoute\(\[[\s\S]*?\],)\{\}\)/,
              "$1{ignoreURLParametersMatching:[/^[a-zA-Z0-9_.-]+$/]})"
            )
          );
        }
      } catch (error) {
        this.warn(`Unable to update service worker cache matching: ${error}`);
      }
    }
  };
}

function appendBuildNumberToHtml(html: string, value: string) {
  const withThemedManifest = html.replace(
    /<link rel="manifest" href="\/manifest\.webmanifest">/,
    [
      '<link rel="manifest" href="/manifest-light.webmanifest" media="(prefers-color-scheme: light)">',
      '<link rel="manifest" href="/manifest-dark.webmanifest" media="(prefers-color-scheme: dark)">'
    ].join("")
  );

  return withThemedManifest.replace(
    /\b(src|href)=(["'])([^"']+\.(?:js|css|png|jpg|jpeg|webp|svg|ico|webmanifest|wasm))(?:\?[^"']*)?\2/g,
    (_match, attribute: string, quote: string, url: string) => {
      if (/^(?:https?:)?\/\//.test(url)) {
        return `${attribute}=${quote}${url}${quote}`;
      }

      return `${attribute}=${quote}${url}?${value}${quote}`;
    }
  );
}

function themedManifest(value: string, theme: "light" | "dark") {
  const light = theme === "light";

  return {
    name: "Cash Flow",
    short_name: "Cash Flow",
    description: "Personal finance, Zakat, assets, investments, and loans.",
    start_url: "/",
    display: "standalone",
    background_color: light ? "#f4f8f6" : "#0d1716",
    theme_color: light ? "#f4f8f6" : "#0d1716",
    lang: "en",
    scope: "/",
    icons: [
      {
        src: `/icons/icon-${theme}-192.png?${value}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: `/icons/icon-${theme}-512.png?${value}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      }
    ]
  };
}

export default defineConfig({
  define: {
    __APP_BUILD_NUMBER__: JSON.stringify(buildNumber)
  },
  plugins: [
    react(),
    VitePWA({
      injectRegister: false,
      registerType: "autoUpdate",
      includeAssets: [
        "icons/favicon.png",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/icon-light-192.png",
        "icons/icon-light-512.png",
        "icons/icon-dark-192.png",
        "icons/icon-dark-512.png",
        "brand/logo-wordmark.png",
        "sql-wasm.wasm"
      ],
      manifest: {
        name: "Cash Flow",
        short_name: "Cash Flow",
        description: "Personal finance, Zakat, assets, investments, and loans.",
        theme_color: "#0d1716",
        background_color: "#0d1716",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: `/icons/icon-dark-192.png?${buildNumber}`,
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: `/icons/icon-dark-512.png?${buildNumber}`,
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        globIgnores: ["**/build.json"],
        ignoreURLParametersMatching: [/^[a-zA-Z0-9_.-]+$/],
        navigateFallback: "/offline",
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "document",
            handler: "NetworkFirst",
            options: { cacheName: "cash-flow-pages" }
          },
          {
            urlPattern: ({ request, url }) =>
              request.method === "GET" && url.pathname.startsWith("/api/v1/") && !url.pathname.includes("/auth/"),
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

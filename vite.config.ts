import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Standard plugins, exactly once. This preserves the existing SSR build target;
// it is a build compatibility choice, not approval of production hosting.
export default defineConfig(({ command, mode }) => {
  const isPages = mode === "github-pages";
  const basepath = "/mawid-pro";
  const localApi =
    command === "serve" && mode === "development"
      ? process.env["MAWID_LOCAL_API_ORIGIN"]
      : undefined;
  if (localApi) {
    const url = new URL(localApi);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      !url.port ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error("INVALID_LOCAL_BOOKING_ORIGIN");
  }
  return {
    base: isPages ? `${basepath}/` : "/",
    server: {
      host: "127.0.0.1",
      port: 8080,
      ...(localApi
        ? {
            proxy: {
              "/__booking_api": {
                target: localApi,
                changeOrigin: true,
                rewrite: (p: string) => p.replace(/^\/__booking_api/, ""),
                configure: (proxy) => {
                  proxy.on("proxyReq", (req) => {
                    req.setHeader("origin", localApi);
                  });
                },
              },
            },
          }
        : {}),
    },
    preview: { host: "127.0.0.1" },
    css: { transformer: "lightningcss" },
    resolve: {
      dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
    },
    plugins: [
      tailwindcss(),
      tsconfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        server: { entry: "server" },
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
        ...(isPages
          ? {
              router: { basepath },
              spa: {
                enabled: true,
                maskPath: `${basepath}/`,
                prerender: { outputPath: `${basepath}/index`, crawlLinks: false },
              },
              sitemap: { enabled: false },
            }
          : {}),
      }),
      ...(command === "build" && !isPages ? [nitro({ preset: "cloudflare-module" })] : []),
      react(),
    ],
  };
});

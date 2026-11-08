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
  return {
    base: isPages ? `${basepath}/` : "/",
    server: { host: "127.0.0.1", port: 8080 },
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

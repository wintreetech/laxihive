import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import {
  backendEnvFile,
  readBackendEnv,
  frontendOrigin,
} from "../backend/scripts/env.mjs";

export default defineConfig(() => {
  // These settings configure Vite's Node server; they never enter the client.
  const env = readBackendEnv();
  const origin = new URL(frontendOrigin(env));
  return {
    plugins: [
      react(),
      {
        name: "reload-backend-dev-settings",
        configureServer(server) {
          server.middlewares.use("/__lexihive_dev", (_req, res) => {
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({ status: "ok", service: "lexihive-frontend" }),
            );
          });
          server.watcher.add(backendEnvFile);
          server.watcher.on("change", (file) => {
            if (
              file.replaceAll("\\", "/") ===
              backendEnvFile.replaceAll("\\", "/")
            )
              void server.restart();
          });
        },
      },
    ],
    server: {
      host: origin.hostname,
      port: Number(origin.port || (origin.protocol === "https:" ? 443 : 80)),
      strictPort: true,
      fs: {
        allow: [
          fileURLToPath(new URL("./", import.meta.url)),
          fileURLToPath(new URL("../backend/shared/", import.meta.url)),
        ],
      },
      proxy: { "/api": `http://127.0.0.1:${env.PORT || 4000}` },
    },
  };
});

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDatabase } from "../../backend/scripts/database.mjs";
import { readBackendEnv } from "../../backend/scripts/env.mjs";
await ensureDatabase({
  databaseUrl:
    readBackendEnv().TEST_DATABASE_URL ||
    "mongodb://127.0.0.1:27018/lexihive_test?replicaSet=lexihive-local",
});
const require = createRequire(import.meta.url);
const cli = join(
  dirname(require.resolve("@playwright/test/package.json")),
  "cli.js",
);
const env = { ...process.env };
if (process.platform === "win32") {
  // Set this before Playwright starts, including its config-loader subprocesses.
  const pathKey =
    Object.keys(env).find((k) => k.toLowerCase() === "path") || "Path";
  const pathValue = `${env[pathKey] || ""};${join(env.SystemRoot || "C:/Windows", "System32")}`;
  for (const key of Object.keys(env))
    if (key.toLowerCase() === "path") delete env[key];
  env.Path = pathValue;
}
const result = spawnSync(
  process.execPath,
  [
    cli,
    "test",
    "--config",
    fileURLToPath(new URL("../playwright.config.ts", import.meta.url)),
    ...process.argv.slice(2),
  ],
  { env, stdio: "inherit", windowsHide: true },
);
process.exitCode = result.status ?? 1;

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { ensureDatabase } from "./database.mjs";
import { readBackendEnv, frontendOrigin } from "./env.mjs";
import { checkDevServer } from "./dev-ports.mjs";
const backendOnly = process.argv.includes("--backend");
const settings = readBackendEnv();
const appOrigin = frontendOrigin(settings);
const apiOrigin = `http://localhost:${settings.PORT || 4000}`;
let apiState, frontendState;
try {
  apiState = await checkDevServer(apiOrigin, "backend");
  frontendState = backendOnly
    ? "skip"
    : await checkDevServer(appOrigin, "frontend");
  if (apiState === "available") await ensureDatabase();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(
  backendOnly
    ? `Starting API: ${apiOrigin} (frontend: ${appOrigin})`
    : `Starting LexiHive: ${appOrigin} (API: ${apiOrigin})`,
);
if (apiState === "running")
  console.log(`LexiHive API is already running: ${apiOrigin}. Reusing it.`);
if (frontendState === "running")
  console.log(
    `LexiHive frontend is already running: ${appOrigin}. Reusing it.`,
  );
const children = [];
if (apiState === "available") {
  const generated = spawn(process.execPath, ["scripts/generate-client.mjs"], {
    cwd: new URL("../", import.meta.url),
    stdio: "inherit",
  });
  const result = await new Promise((resolve) => {
    generated.once("error", () => resolve(1));
    generated.once("exit", resolve);
  });
  if (result !== 0) process.exit(1);
  children.push(
    spawn(process.execPath, ["scripts/watch-api.mjs"], {
      cwd: new URL("../", import.meta.url),
      stdio: "inherit",
    }),
  );
}
if (frontendState === "available") {
  const require = createRequire(
    new URL("../../frontend/package.json", import.meta.url),
  );
  const vite = join(
    dirname(require.resolve("vite/package.json")),
    "bin",
    "vite.js",
  );
  children.push(
    spawn(process.execPath, [vite], {
      cwd: new URL("../../frontend/", import.meta.url),
      stdio: "inherit",
    }),
  );
}
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await Promise.all(
    children.map((child) => {
      if (!child.pid) return;
      if (process.platform !== "win32") {
        child.kill("SIGTERM");
        return;
      }
      return new Promise((resolve) => {
        // Node's watch process owns another Node process; stop the whole dev tree.
        const killer = spawn(
          join(process.env.SystemRoot || "C:/Windows", "System32/taskkill.exe"),
          ["/PID", String(child.pid), "/T", "/F"],
          { windowsHide: true, stdio: "ignore" },
        );
        killer.once("error", () => {
          child.kill();
          resolve();
        });
        killer.once("exit", resolve);
      });
    }),
  );
  process.exitCode = code;
}
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stop();
  });

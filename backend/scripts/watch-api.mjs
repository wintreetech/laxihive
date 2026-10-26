import { spawn } from "node:child_process";
import { backend } from "./env.mjs";
import { watchSources } from "./source-watch.mjs";

let child;
let stopping = false;
let restarts = Promise.resolve();
function start() {
  if (stopping) return;
  const api = spawn(
    process.execPath,
    ["--import", "tsx", "--env-file-if-exists=.env", "src/index.ts"],
    {
      cwd: backend,
      stdio: "inherit",
    },
  );
  child = api;
  api.once("error", (error) => {
    if (child === api) child = null;
    console.error(error.message);
  });
  api.once("exit", (code) => {
    const unexpected = child === api;
    if (unexpected) child = null;
    if (unexpected && !stopping && code)
      console.error(
        "API stopped. Fix the reported error and save a source file or backend/.env to restart.",
      );
  });
}
async function stopChild() {
  const api = child;
  if (!api || api.exitCode !== null) return;
  child = null;
  await new Promise((resolve) => {
    const timer = setTimeout(() => api.kill("SIGKILL"), 5000);
    api.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    api.kill("SIGTERM");
  });
}
const closeWatch = watchSources(backend, () => {
  restarts = restarts.then(async () => {
    if (stopping) return;
    console.log("Backend source/configuration changed. Restarting API...");
    await stopChild();
    start();
  });
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    closeWatch();
    await stopChild();
  });
start();

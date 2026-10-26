import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(
  new URL("../package.json", import.meta.url),
);
const vite = join(dirname(require.resolve("vite/package.json")), "bin/vite.js");
const child = spawn(process.execPath, [vite], {
  cwd: new URL("../", import.meta.url),
  env: { ...process.env, APP_ORIGIN: "http://localhost:5185", PORT: "4011" },
  stdio: "inherit",
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));

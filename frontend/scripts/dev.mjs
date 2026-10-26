import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { frontendOrigin } from "../../backend/scripts/env.mjs";
import { checkDevServer } from "../../backend/scripts/dev-ports.mjs";

try {
  const origin = frontendOrigin();
  if ((await checkDevServer(origin, "frontend")) === "running") {
    console.log(
      `LexiHive frontend is already running: ${origin}. Use the existing server; no second copy started.`,
    );
  } else {
    const require = createRequire(new URL("../package.json", import.meta.url));
    const vite = join(
      dirname(require.resolve("vite/package.json")),
      "bin/vite.js",
    );
    const child = spawn(process.execPath, [vite], {
      cwd: new URL("../", import.meta.url),
      stdio: "inherit",
    });
    child.once("error", (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    child.once("exit", (code) => {
      process.exitCode = code ?? 1;
    });
    for (const signal of ["SIGINT", "SIGTERM"])
      process.on(signal, () => child.kill(signal));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

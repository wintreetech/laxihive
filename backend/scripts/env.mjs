import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const backend = fileURLToPath(new URL("../", import.meta.url));
export const backendEnvFile = join(backend, ".env");

// Keep file settings out of the launcher's environment, so child servers can
// reload edited .env values instead of inheriting stale ones.
export function readBackendEnv() {
  const file = existsSync(backendEnvFile)
    ? parseEnv(readFileSync(backendEnvFile, "utf8"))
    : {};
  return { ...file, ...process.env };
}

export function frontendOrigin(env = readBackendEnv()) {
  const url = new URL(env.APP_ORIGIN || "http://localhost:5174");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "APP_ORIGIN must be a frontend origin such as http://localhost:5174, without a page path.",
    );
  return url.origin;
}

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, watch } from "node:fs";
import { join } from "node:path";

// Compare contents: Windows may report access/metadata changes as file events.
export function sourceFingerprint(directory) {
  const hash = createHash("sha256");
  function visit(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const file = join(folder, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile())
        hash.update(file).update("\0").update(readFileSync(file)).update("\0");
    }
  }
  for (const folder of ["src", "shared"]) visit(join(directory, folder));
  const env = join(directory, ".env");
  if (existsSync(env)) hash.update(readFileSync(env));
  return hash.digest("hex");
}

export function watchSources(directory, changed, debounceMs = 200) {
  let previous = sourceFingerprint(directory);
  let timer;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      let current;
      try {
        current = sourceFingerprint(directory);
      } catch (error) {
        if (error.code === "ENOENT") {
          schedule();
          return;
        }
        throw error;
      }
      if (current !== previous) {
        previous = current;
        changed();
      }
    }, debounceMs);
  };
  const watchers = ["src", "shared"].map((folder) =>
    watch(join(directory, folder), { recursive: true }, schedule),
  );
  // Watch only .env in the parent; database/log writes must never restart the API.
  watchers.push(
    watch(directory, (_event, name) => {
      if (!name || name.toString() === ".env") schedule();
    }),
  );
  return () => {
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
  };
}

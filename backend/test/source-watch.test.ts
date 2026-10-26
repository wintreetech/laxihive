import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  utimesSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error Development helper is JavaScript and is not part of the emitted API.
import { sourceFingerprint, watchSources } from "../scripts/source-watch.mjs";

test("API watcher ignores database writes and unchanged file events but reloads code and env edits", async () => {
  const root = mkdtempSync(join(tmpdir(), "lexihive-source-watch-"));
  for (const name of ["src", "shared", ".local"]) mkdirSync(join(root, name));
  const source = join(root, "src/index.ts");
  const env = join(root, ".env");
  writeFileSync(source, "export const value = 1;");
  writeFileSync(env, "PORT=4000\n");
  let changes = 0;
  const close = watchSources(root, () => changes++, 30);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 180));
  try {
    const before = sourceFingerprint(root);
    writeFileSync(join(root, ".local/database.log"), "database checkpoint");
    writeFileSync(source, readFileSync(source));
    utimesSync(source, new Date(), new Date());
    await settle();
    assert.equal(sourceFingerprint(root), before);
    assert.equal(changes, 0);
    writeFileSync(source, "export const value = 2;");
    await settle();
    assert.equal(changes, 1);
    writeFileSync(env, "PORT=4001\n");
    await settle();
    assert.equal(changes, 2);
  } finally {
    close();
    assert.ok(root.startsWith(join(tmpdir(), "lexihive-source-watch-")));
    rmSync(root, { recursive: true, force: true });
  }
});

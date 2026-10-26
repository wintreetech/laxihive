import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { backend } from "./env.mjs";
const require = createRequire(
  new URL("../package.json", import.meta.url),
);
const source = join(backend, "prisma/schema.prisma");
const generated = join(
  dirname(require.resolve("@prisma/client/package.json")),
  "../../.prisma/client/schema.prisma",
);
// Prisma formats its copied schema. Ignore formatting/comments while preserving quoted literals.
const normalize = (s) =>
  s.replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*|\s+/g, (token) =>
    token.startsWith('"') ? token : "",
  );
if (
  !existsSync(generated) ||
  normalize(readFileSync(generated, "utf8")) !==
    normalize(readFileSync(source, "utf8"))
) {
  const cli = join(
    dirname(require.resolve("prisma/package.json")),
    "build/index.js",
  );
  const result = spawnSync(process.execPath, [cli, "generate"], {
    cwd: backend,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ||
        "mongodb://127.0.0.1:27018/lexihive?replicaSet=lexihive-local",
    },
  });
  if (result.status !== 0) {
    console.error(
      "Database client generation failed. On Windows, stop this project's API before regenerating a changed schema.",
    );
    process.exit(result.status || 1);
  }
}

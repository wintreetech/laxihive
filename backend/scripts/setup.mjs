import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { ensureDatabase } from "./database.mjs";
import { root, backend, readBackendEnv, frontendOrigin } from "./env.mjs";

async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: backend,
      stdio: "inherit",
      env: readBackendEnv(),
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error("Setup stopped because the preceding command failed."),
          ),
    );
  });
}

try {
  for (const folder of ["backend", "frontend"]) {
    const target = join(root, folder, ".env");
    if (existsSync(target)) {
      console.log(`Keeping existing ${folder}/.env.`);
      continue;
    }
    let content = await readFile(join(root, folder, ".env.example"), "utf8");
    if (folder === "backend")
      content = content.replace(
        /^SESSION_SECRET=.*$/m,
        `SESSION_SECRET=${randomBytes(48).toString("hex")}`,
      );
    await writeFile(target, content, { flag: "wx" });
    console.log(`Created ${folder}/.env.`);
  }
  await ensureDatabase();
  const require = createRequire(
    new URL("../package.json", import.meta.url),
  );
  const prisma = join(
    dirname(require.resolve("prisma/package.json")),
    "build/index.js",
  );
  await run([prisma, "generate"]);
  await run([prisma, "db", "push", "--skip-generate"]);
  await run(["--import", "tsx", "prisma/migrate.ts"]);
  await run(["--import", "tsx", "prisma/seed.ts"]);
  console.log(
    `\nSetup complete. Run npm run dev, then open ${frontendOrigin()}`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

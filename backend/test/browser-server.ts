// Isolated browser fixtures only. This file is excluded from the production build.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import express from "express";
process.loadEnvFile(".env");
assert.equal(
  process.env.LEXIHIVE_E2E_FIXTURE,
  "true",
  "Use npm run test:e2e to start isolated fixtures.",
);
const url = new URL(
  process.env.TEST_DATABASE_URL ||
    "mongodb://127.0.0.1:27018/lexihive_test?replicaSet=lexihive-local",
);
url.pathname = "/lexihive_browser_test";
process.env.DATABASE_URL = url.toString();
Object.assign(process.env, {
  NODE_ENV: "development",
  APP_ORIGIN: "http://localhost:5185",
  PORT: "4011",
  SESSION_SECRET: "browser-fixture-secret-not-for-production",
  ADMIN_EMAIL: "",
  PAYMENT_PROVIDER: "transactworld",
  PAYMENTS_ENABLED: "true",
  TW_ENVIRONMENT: "sandbox",
  MEMBER_ID: "fixture-member",
  WORKING_KEY: "browser-fixture-working-key-not-real",
  TW_AUTH_TOKEN: "",
  SMTP_HOST: "",
  MAIL_FROM: "",
  PUBLIC_API_URL: "http://localhost:4011",
  MERCHANT_REDIRECT_URL: "",
  NOTIFICATION_URL: "",
  TW_SUPPORTED_CURRENCIES: "EUR",
  TW_ALLOW_LOCAL_CHECKOUT: "true",
  PAYMENT_RECONCILIATION_ENABLED: "false",
});
const { db, atomic } = await import("../src/config/database.js");
const { hashPassword } = await import("../src/middleware/auth.middleware.js");
const { ledger } = await import("../src/services/wallet.service.js");
assert.equal(
  new URL(process.env.DATABASE_URL!).pathname,
  "/lexihive_browser_test",
);
await db.$runCommandRaw({ dropDatabase: 1 });
const require = createRequire(new URL("../package.json", import.meta.url));
const cli = join(
  dirname(require.resolve("prisma/package.json")),
  "build/index.js",
);
for (const args of [
  [cli, "db", "push", "--skip-generate"],
  ["--import", "tsx", "prisma/seed.ts"],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: new URL("../", import.meta.url),
    env: process.env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
}
for (const role of ["ADMIN", "USER"]) {
  const u = await db.user.create({
    data: {
      email:
        role === "ADMIN" ? "admin@fixture.invalid" : "player@fixture.invalid",
      displayName: `${role} browser fixture`,
      passwordHash: await hashPassword("browser fixture password"),
      role,
      verifiedAt: new Date(),
      profile: { create: {} },
      wallet: { create: {} },
    },
  });
  if (role === "USER")
    await atomic((tx) =>
      ledger(
        tx,
        u.id,
        1000,
        "admin",
        "fixture:browser-credit",
        "Isolated browser testing coins",
      ),
    );
}
const { createApp } = await import("../src/app.js");
const app = express();
app.get("/api/__fixture", (_req, res) =>
  res.json({ database: "lexihive_browser_test" }),
);
app.use(createApp({ stripe: null }));
const server = app.listen(4011, "127.0.0.1", () =>
  console.log("Isolated browser API ready on 4011."),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      await db.$disconnect();
      process.exit(0);
    }),
  );

import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { databaseDiagnostic } from "../src/config/database-diagnostics.js";
import { db } from "../src/config/database.js";
import { createApp } from "../src/app.js";

test("database diagnostics identify causes without exposing provider messages or credentials", () => {
  const credentials =
    "mongodb://private-user:private-password@private-host/lexihive";
  const cases = [
    [
      "18",
      `Authentication failed ${credentials}`,
      "database_authentication_failed",
    ],
    ["13", `not authorized ${credentials}`, "database_permission_denied"],
    [
      "8000",
      `empty database name not allowed ${credentials}`,
      "database_name_invalid",
    ],
    [
      "unknown",
      `Server selection timed out ${credentials}`,
      "database_network_unavailable",
    ],
    [
      "unknown",
      `TLS certificate failure ${credentials}`,
      "database_tls_failed",
    ],
    ["unknown", `querySrv ENOTFOUND ${credentials}`, "database_dns_failed"],
    [
      "unknown",
      `Some unexpected failure ${credentials}`,
      "database_operation_failed",
    ],
  ];
  for (const [providerCode, message, reason] of cases) {
    const diagnostic = databaseDiagnostic({
      code: "P2010",
      meta: { code: providerCode, message },
    });
    assert.equal(diagnostic.reason, reason);
    assert.equal(
      diagnostic.providerCode,
      /^\d+$/.test(providerCode) ? providerCode : null,
    );
    assert(!JSON.stringify(diagnostic).includes("private-"));
  }
  assert.equal(databaseDiagnostic(null).reason, "database_operation_failed");
});

test("health reports database outages as 503 with safe server diagnostics and recovers when ping succeeds", async () => {
  const original = db.$runCommandRaw;
  const originalLog = console.error;
  const logs: string[] = [];
  try {
    console.error = (...args: unknown[]) => {
      logs.push(args.join(" "));
    };
    db.$runCommandRaw = (async () => {
      throw Object.assign(new Error("private-password"), {
        code: "P2010",
        meta: {
          code: "18",
          message:
            "Authentication failed: mongodb://private-user:private-password@private-host/lexihive",
        },
      });
    }) as typeof db.$runCommandRaw;
    const app = createApp({ stripe: null });
    const unavailable = await request(app).get("/api/health");
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.status, "unavailable");
    assert(!JSON.stringify(unavailable.body).includes("private-"));
    assert(
      logs.some(
        (line) => JSON.parse(line).reason === "database_authentication_failed",
      ),
    );
    assert(!logs.join(" ").includes("private-"));
    db.$runCommandRaw = (async () => ({ ok: 1 })) as typeof db.$runCommandRaw;
    const healthy = await request(app).get("/api/health");
    assert.equal(healthy.status, 200);
    assert.equal(healthy.body.status, "ok");
  } finally {
    db.$runCommandRaw = original;
    console.error = originalLog;
  }
});

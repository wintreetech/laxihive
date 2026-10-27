import { MongoClient } from "mongodb";
import { PrismaClient } from "@prisma/client";
import { readBackendEnv } from "./env.mjs";
// Render has a compiled build. Before a local build, keep the fallback safe too.
const diagnose = await import("../dist/src/config/database-diagnostics.js")
  .then((module) => module.databaseDiagnostic)
  .catch(() => () => ({
    reason: "database_connection_failed",
    hint: "Build the backend for detailed diagnostics. Check Atlas Network Access and the live DATABASE_URL.",
  }));
const settings = readBackendEnv();
const client = new MongoClient(settings.DATABASE_URL, {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
});
const prisma = new PrismaClient({ datasourceUrl: settings.DATABASE_URL });
try {
  const checks = await Promise.allSettled([
    (async () => {
      await client.connect();
      await client.db().command({ ping: 1 });
    })(),
    (async () => {
      await prisma.$connect();
      await prisma.$runCommandRaw({ ping: 1 });
    })(),
  ]);
  console.log(
    JSON.stringify(
      {
        connectionChecks: checks.map((result, index) => ({
          driver: index === 0 ? "mongodb" : "prisma",
          connected: result.status === "fulfilled",
          ...(result.status === "rejected"
            ? { diagnostic: diagnose(result.reason) }
            : {}),
        })),
      },
      null,
      2,
    ),
  );
  if (checks.some((result) => result.status === "rejected"))
    process.exitCode = 1;
  if (checks[0].status === "rejected") throw checks[0].reason;
  const db = client.db();
  const names = (
    await db.listCollections({}, { nameOnly: true }).toArray()
  ).map((c) => c.name);
  const owner = settings.ADMIN_EMAIL
    ? await db
        .collection("User")
        .findOne(
          { email: settings.ADMIN_EMAIL.toLowerCase() },
          { projection: { verifiedAt: 1, role: 1 } },
        )
    : null;
  console.log(
    JSON.stringify(
      {
        connected: true,
        database: db.databaseName,
        collections: names,
        gameCount: await db.collection("Game").countDocuments(),
        configuredAdminRegistered: !!owner,
        configuredAdminVerified: !!owner?.verifiedAt,
        configuredAdminRole: owner?.role,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      connected: false,
      diagnostic: diagnose(error),
      message:
        "Cannot reach the configured database. Check Atlas network access, credentials and connectivity. Connection strings are not logged.",
    }),
  );
  process.exitCode = 1;
} finally {
  await Promise.allSettled([client.close(), prisma.$disconnect()]);
}

import { MongoClient } from "mongodb";
import { readBackendEnv } from "./env.mjs";
const settings = readBackendEnv();
const client = new MongoClient(settings.DATABASE_URL, {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
});
try {
  await client.connect();
  const db = client.db();
  await db.command({ ping: 1 });
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
      error: error.name,
      code: error.code ?? null,
      message:
        "Cannot reach the configured database. Check Atlas network access, credentials and connectivity. Connection strings are not logged.",
    }),
  );
  process.exitCode = 1;
} finally {
  await client.close();
}

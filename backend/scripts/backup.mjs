import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MongoClient, BSON } from "mongodb";
import { backend, readBackendEnv } from "./env.mjs";
const client = new MongoClient(readBackendEnv().DATABASE_URL);
try {
  await client.connect();
  const database = client.db(),
    collections = await database
      .listCollections({}, { nameOnly: true })
      .toArray();
  const folder = join(
    backend,
    ".local/backups",
    new Date().toISOString().replaceAll(/[:.]/g, "-"),
  );
  await mkdir(folder, { recursive: true });
  const session = client.startSession();
  const counts = {};
  try {
    await session.withTransaction(
      async () => {
        for (const { name } of collections) {
          const rows = await database
            .collection(name)
            .find({}, { session })
            .toArray();
          counts[name] = rows.length;
          await writeFile(
            join(folder, `${name}.json`),
            BSON.EJSON.stringify(rows, { relaxed: false }),
            { mode: 0o600 },
          );
        }
      },
      { readConcern: { level: "snapshot" } },
    );
  } finally {
    await session.endSession();
  }
  await writeFile(
    join(folder, "manifest.json"),
    JSON.stringify(
      { database: database.databaseName, createdAt: new Date(), counts },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    `Private local snapshot saved in ${folder}. ${collections.length} collections; no source database changes.`,
  );
} finally {
  await client.close();
}

import { readFileSync } from "node:fs";
import { resolve, sep, join } from "node:path";
import { MongoClient, BSON } from "mongodb";
import { backend, readBackendEnv } from "./env.mjs";
const snapshots = resolve(backend, ".local/backups");
const snapshot = resolve(process.argv[2] || "");
if (!snapshot.startsWith(snapshots + sep))
  throw new Error("Choose a snapshot inside backend/.local/backups.");
const manifest = JSON.parse(
  readFileSync(join(snapshot, "manifest.json"), "utf8"),
);
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
};
const client = new MongoClient(readBackendEnv().DATABASE_URL, {
  serverSelectionTimeoutMS: 10000,
});
try {
  await client.connect();
  const database = client.db();
  if (database.databaseName !== manifest.database)
    throw new Error("Snapshot belongs to a different database.");
  let compared = 0,
    missing = 0,
    changed = 0;
  for (const name of Object.keys(manifest.counts)) {
    if (name === "SchemaVersion") continue;
    const rows = BSON.EJSON.parse(
      readFileSync(join(snapshot, `${name}.json`), "utf8"),
    );
    for (const before of rows) {
      compared++;
      const after = await database
        .collection(name)
        .findOne({ _id: before._id });
      if (!after) {
        missing++;
        continue;
      }
      const original = Object.fromEntries(
        Object.keys(before).map((key) => [key, after[key]]),
      );
      if (
        JSON.stringify(canonical(BSON.EJSON.serialize(before))) !==
        JSON.stringify(canonical(BSON.EJSON.serialize(original)))
      )
        changed++;
    }
  }
  console.log(
    JSON.stringify({
      compared,
      missing,
      changed,
      scope:
        "All original record fields except migration bookkeeping; new additive fields are allowed.",
    }),
  );
  if (missing || changed) process.exitCode = 1;
} catch {
  console.error(
    "Preservation check failed. Verify snapshot path and database connectivity; no records or credentials are logged.",
  );
  process.exitCode = 1;
} finally {
  await client.close();
}

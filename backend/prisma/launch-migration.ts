import { MongoClient, type Db } from "mongodb";
export async function applyLaunchMigration(database: Db) {
  const existing = new Set(
    (await database.listCollections({}, { nameOnly: true }).toArray()).map(
      (c) => c.name,
    ),
  );
  for (const name of ["SettlementReview", "SettlementClaim", "FxRate"])
    if (!existing.has(name)) await database.createCollection(name);
  await database
    .collection("SettlementReview")
    .createIndex(
      { paymentId: 1, createdAt: 1 },
      { name: "SettlementReview_paymentId_createdAt_idx" },
    );
  await database
    .collection("SettlementReview")
    .createIndex(
      { status: 1, createdAt: 1 },
      { name: "SettlementReview_status_createdAt_idx" },
    );
  await database
    .collection("CoinPricingConfig")
    .updateMany(
      { pricingPolicy: { $exists: false } },
      { $set: { pricingPolicy: "INDEPENDENT" } },
    );
  await database
    .collection("Payment")
    .updateMany(
      { settlementRevision: { $exists: false } },
      { $set: { settlementRevision: 0 } },
    );
  await database
    .collection<any>("SchemaVersion")
    .updateOne(
      { _id: "005-launch-policy-settlement-fx" },
      { $set: { appliedAt: new Date() } },
      { upsert: true },
    );
}
if (process.argv.includes("--apply")) {
  const client = new MongoClient(process.env.DATABASE_URL!, {
    serverSelectionTimeoutMS: 10000,
  });
  try {
    await client.connect();
    await applyLaunchMigration(client.db());
    console.log(
      "Applied additive launch migration 005. No collections/indexes were removed and no wallet amounts, prices or payment outcomes were changed.",
    );
  } catch {
    console.error(
      "Launch migration failed. Check the configured database connection; retry is idempotent.",
    );
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

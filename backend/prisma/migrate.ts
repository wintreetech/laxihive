import { MongoClient } from "mongodb";
const client = new MongoClient(process.env.DATABASE_URL!);
await client.connect();
const db = client.db();
try {
  // MongoDB's unique null semantics require partial indexes for optional provider IDs.
  for (const field of ["checkoutId", "intentId"]) {
    const indexes = await db.collection("Payment").listIndexes().toArray();
    if (
      indexes.some(
        (i) => i.name === `Payment_${field}_key` && !i.partialFilterExpression,
      )
    )
      await db.collection("Payment").dropIndex(`Payment_${field}_key`);
    await db.collection("Payment").createIndex(
      { [field]: 1 },
      {
        name: `Payment_${field}_key`,
        unique: true,
        partialFilterExpression: { [field]: { $type: "string" } },
      },
    );
  }
  await db.command({
    collMod: "Wallet",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["balance", "debt"],
        properties: {
          balance: {
            bsonType: ["int", "long", "double"],
            minimum: 0,
            multipleOf: 1,
          },
          debt: {
            bsonType: ["int", "long", "double"],
            minimum: 0,
            multipleOf: 1,
          },
        },
      },
    },
    validationLevel: "strict",
    validationAction: "error",
  });
  await db
    .collection<any>("SchemaVersion")
    .updateOne(
      { _id: "001-wallet-integrity" },
      { $set: { appliedAt: new Date() } },
      { upsert: true },
    );
  // Backfill additive fields for installations created before campaign/provider support.
  await db
    .collection("Payment")
    .updateMany(
      { provider: { $exists: false } },
      { $set: { provider: "stripe" } },
    );
  await db
    .collection("Payment")
    .updateMany(
      { disputeCents: { $exists: false } },
      { $set: { disputeCents: 0, disputeEventCreated: 0 } },
    );
  await db
    .collection("GameSession")
    .updateMany({ level: { $exists: false } }, { $set: { level: 1 } });
  await db
    .collection("UserGameProgress")
    .updateMany({ campaign: { $exists: false } }, { $set: { campaign: {} } });
  await db
    .collection<any>("SchemaVersion")
    .updateOne(
      { _id: "002-provider-campaign" },
      { $set: { appliedAt: new Date() } },
      { upsert: true },
    );
  await db
    .collection("CoinQuote")
    .updateMany(
      { currency: { $exists: false } },
      { $set: { currency: "usd" } },
    );
  await db
    .collection("Payment")
    .updateMany(
      { currency: { $exists: false } },
      { $set: { currency: "usd" } },
    );
  await db
    .collection("CoinPricingConfig")
    .updateMany(
      { coinsPerEuro: { $exists: false } },
      { $set: { coinsPerEuro: 0 } },
    );
  await db
    .collection<any>("SchemaVersion")
    .updateOne(
      { _id: "003-purchase-currencies" },
      { $set: { appliedAt: new Date() } },
      { upsert: true },
    );
  console.log(
    "Applied MongoDB migrations 001-003: wallet integrity, provider records and purchase currencies.",
  );
  await db
    .collection("User")
    .updateMany({ status: { $exists: false } }, { $set: { status: "ACTIVE" } });
  for (const [field, value] of Object.entries({
    billingState: "LEGACY",
    accessType: "FREE_FULL",
    coinPrice: 0,
    pricingVersion: 0,
    trialSeconds: 0,
    sessionSeconds: 600,
  }))
    await db
      .collection("GameSession")
      .updateMany(
        { [field]: { $exists: false } },
        { $set: { [field]: value } },
      );
  await db
    .collection<any>("SchemaVersion")
    .updateOne(
      { _id: "004-session-billing" },
      { $set: { appliedAt: new Date() } },
      { upsert: true },
    );
  console.log(
    "Applied additive migration 004: account status and backward-compatible session snapshots. No paid pricing published.",
  );
} finally {
  await client.close();
}

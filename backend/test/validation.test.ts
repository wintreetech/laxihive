import { test } from "node:test";
import assert from "node:assert/strict";
import { registerSchema } from "../src/routes/auth.routes.js";
import { pricingSchema } from "../src/routes/admin.routes.js";
import { completionSchema } from "../src/routes/game.routes.js";
import {
  hashPassword,
  verifyPassword,
} from "../src/middleware/auth.middleware.js";
test("Signup validates passwords, legal acceptance and bot honeypot", () => {
  const good = {
    displayName: "Curious",
    email: "player@example.com",
    password: "a-good-long-password",
    confirmPassword: "a-good-long-password",
    terms: true,
    website: "",
  };
  assert.equal(registerSchema.parse(good).email, good.email);
  for (const value of [
    { ...good, password: "short" },
    { ...good, terms: false },
    { ...good, website: "spam" },
    { ...good, confirmPassword: "different" },
  ])
    assert.equal(registerSchema.safeParse(value).success, false);
});
test("Pricing validation rejects misaligned boundaries and fractional coin output", () => {
  assert.equal(
    pricingSchema.safeParse({
      minCents: 500,
      maxCents: 50000,
      stepCents: 500,
      coinsPerDollar: 100,
      enabled: true,
    }).success,
    true,
  );
  assert.equal(
    pricingSchema.safeParse({
      minCents: 501,
      maxCents: 50000,
      stepCents: 500,
      coinsPerDollar: 1,
      enabled: true,
    }).success,
    false,
  );
});
test("Completion requests cannot submit trusted score, XP or wallet amounts", () => {
  const parsed = completionSchema.parse({
    sessionId: "id",
    actions: [{ type: "submit", value: "HONEY" }],
    score: 100000,
    xp: 10000,
    coins: 10000,
  });
  assert.equal("score" in parsed, false);
  assert.equal(
    completionSchema.safeParse({
      sessionId: "id",
      actions: [{ type: "award", value: 500 }],
    }).success,
    false,
  );
});
test("Password hashes are salted and verify only the right password", async () => {
  const a = await hashPassword("correct horse battery"),
    b = await hashPassword("correct horse battery");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("correct horse battery", a), true);
  assert.equal(await verifyPassword("incorrect", a), false);
});

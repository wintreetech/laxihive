import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accessSchema,
  sessionView,
} from "../src/services/game-access.service.js";
import { accessProposals } from "../shared/access.js";
import { games } from "../shared/catalog.js";
test("pricing proposals cover the real catalog and cannot make free access consume coins", () => {
  assert.deepEqual(
    Object.keys(accessProposals).sort(),
    games.map((g) => g.slug).sort(),
  );
  const base = {
    accessType: "FREE_FULL",
    coinPrice: 0,
    trialSeconds: 30,
    sessionSeconds: 600,
    active: true,
  };
  assert.equal(accessSchema.safeParse(base).success, true);
  assert.equal(
    accessSchema.safeParse({ ...base, coinPrice: 25 }).success,
    false,
  );
  assert.equal(
    accessSchema.safeParse({ ...base, accessType: "PAID_FROM_START" }).success,
    false,
  );
  assert.equal(
    accessSchema.safeParse({
      ...base,
      accessType: "FREE_TRIAL_THEN_PAID",
      coinPrice: 50,
      sessionSeconds: 30,
    }).success,
    false,
  );
});
test("expired session views hide seeds without marking a purchase or changing a balance", () => {
  const now = new Date();
  const session: any = {
    id: "fixture",
    seed: 42,
    billingState: "TRIAL_ACTIVE",
    trialExpiresAt: new Date(now.getTime() - 1),
    startedAt: now,
  };
  const view = sessionView(session, now);
  assert.equal(view.billingState, "TRIAL_EXPIRED");
  assert.equal(view.seed, undefined);
  assert.equal(session.billingState, "TRIAL_ACTIVE");
  assert.equal("balance" in view, false);
});

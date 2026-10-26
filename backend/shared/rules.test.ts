import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quoteCoins,
  walletChange,
  nextStreak,
  DAILY_REWARD_LIMIT,
  XP_PER_WIN,
} from "./rules.js";
const pricing = {
  minCents: 500,
  maxCents: 50000,
  stepCents: 500,
  coinsPerDollar: 100,
  enabled: true,
  version: 1,
};
test("Integer USD quote calculations and purchase limits", () => {
  assert.equal(quoteCoins(2500, pricing), 2500);
  assert.equal(quoteCoins(50000, pricing), 50000);
  for (const cents of [499, 501, 50001, -100, NaN, 1000.5])
    assert.throws(() => quoteCoins(cents, pricing));
  assert.throws(() => quoteCoins(500, { ...pricing, enabled: false }));
});
test("EUR uses its own configured coin price and cannot fall back to USD", () => {
  assert.equal(
    quoteCoins(2500, { ...pricing, coinsPerEuro: 120 }, "EUR"),
    3000,
  );
  assert.equal(
    quoteCoins(2500, { ...pricing, coinsPerEuro: 120 }, "USD"),
    2500,
  );
  assert.throws(() => quoteCoins(2500, pricing, "EUR"));
  assert.throws(() => quoteCoins(2500, { ...pricing, coinsPerEuro: 0 }, "EUR"));
});
test("Credits offset reversal debt before increasing balance", () => {
  assert.deepEqual(walletChange(100, 0, -150), { balance: 0, debt: 50 });
  assert.deepEqual(walletChange(0, 50, 70), { balance: 20, debt: 0 });
  assert.throws(() => walletChange(-1, 0, 1));
  assert.throws(() => walletChange(0, 0, 1.5));
});
test("UTC streak boundaries and daily reward ceiling are explicit", () => {
  const now = new Date("2026-10-26T00:01:00Z");
  assert.equal(nextStreak(new Date("2026-10-25T23:59:59Z"), 4, now), 5);
  assert.equal(nextStreak(new Date("2026-10-26T00:00:00Z"), 5, now), 5);
  assert.equal(nextStreak(new Date("2026-10-24T23:59:59Z"), 8, now), 1);
  assert.equal(DAILY_REWARD_LIMIT * XP_PER_WIN, 800);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customerEmailAllowed,
  requiresEmailVerification,
  assertAccountEmailConfiguration,
  emailDeliveryAvailable,
} from "../src/config/account-policy.js";
import { baseMinorUnits, fxCoinAmount } from "../shared/money.js";
import { loadFxRate } from "../src/services/fx.service.js";
test("optional email policy grants customer access without claiming verification or requiring SMTP", () => {
  const optional = {
    NODE_ENV: "production",
    REQUIRE_EMAIL_VERIFICATION: "false",
  };
  assert.equal(requiresEmailVerification(optional), false);
  assert.equal(customerEmailAllowed(false, optional), true);
  assert.equal(emailDeliveryAvailable(optional), false);
  assert.doesNotThrow(() => assertAccountEmailConfiguration(optional));
  assert.throws(
    () =>
      assertAccountEmailConfiguration({
        ...optional,
        REQUIRE_EMAIL_VERIFICATION: "true",
      }),
    /SMTP/,
  );
  assert.equal(
    customerEmailAllowed(false, { REQUIRE_EMAIL_VERIFICATION: "true" }),
    false,
  );
  assert.equal(
    customerEmailAllowed(true, { REQUIRE_EMAIL_VERIFICATION: "true" }),
    true,
  );
});
test("FX pricing uses exact minor units and rounds virtual coins down once", () => {
  assert.equal(fxCoinAmount(2500, 100, "1.25"), 2000);
  assert.equal(baseMinorUnits(2500, "1.25"), 2000);
  assert.equal(fxCoinAmount(500, 100, "1.123456"), 445);
  assert.equal(baseMinorUnits(500, "1.123456"), 445);
  assert.equal(baseMinorUnits(500, "1.14"), 439);
  assert.equal(fxCoinAmount(500, 100, "1.14"), 438);
  assert.throws(() => fxCoinAmount(500, 100, "0"));
  assert.throws(() => fxCoinAmount(500, 100, "1e-5"));
  assert.throws(() => baseMinorUnits(1.1, "1.2"));
});
test("FX provider validates pairs and dates, caches rates, and refuses stale/outage guesses", async () => {
  const now = Date.UTC(2026, 9, 27, 15),
    env = {
      FX_RATE_CACHE_TTL_SECONDS: "3600",
      FX_MAX_RATE_AGE_SECONDS: "345600",
    };
  let row: any = null,
    calls = 0;
  const cache = {
    findUnique: async () => row,
    upsert: async (args: any) => {
      row = args.create;
      return row;
    },
  };
  const fetcher = async () => {
    calls++;
    return new Response(
      JSON.stringify({
        date: "2026-10-27",
        base: "EUR",
        quote: "USD",
        rate: 1.25,
      }),
      { status: 200 },
    );
  };
  const options = { now, env, cache, fetcher: fetcher as typeof fetch };
  assert.equal((await loadFxRate("EUR", "USD", options)).rate, "1.25");
  await loadFxRate("EUR", "USD", options);
  assert.equal(calls, 1);
  const outage = async () => {
    throw new Error("fixture outage");
  };
  row.fetchedAt = new Date(now - 7200000);
  assert.equal(
    (
      await loadFxRate("EUR", "USD", {
        ...options,
        fetcher: outage as typeof fetch,
      })
    ).rate,
    "1.25",
  );
  row.asOf = new Date(now - 5 * 86400000);
  await assert.rejects(
    loadFxRate("EUR", "USD", { ...options, fetcher: outage as typeof fetch }),
    /current exchange rate/,
  );
  row = null;
  const wrong = async () =>
    new Response(
      JSON.stringify({
        date: "2026-10-27",
        base: "USD",
        quote: "EUR",
        rate: 1.25,
      }),
    );
  await assert.rejects(
    loadFxRate("EUR", "USD", { ...options, fetcher: wrong as typeof fetch }),
    /current exchange rate/,
  );
  const future = async () =>
    new Response(
      JSON.stringify({
        date: "2026-10-28",
        base: "EUR",
        quote: "USD",
        rate: 1.25,
      }),
    );
  await assert.rejects(
    loadFxRate("EUR", "USD", { ...options, fetcher: future as typeof fetch }),
    /current exchange rate/,
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createGatewayTokenManager } from "../src/services/gateway-token.service.js";
import { inquirePayment } from "../src/services/transactworld.service.js";

const credentials = {
  memberId: "token-unit-merchant",
  workingKey: "unit-test-secret-only",
  authToken: "",
  origin: "https://sandbox.transactworld.com",
};

test("automatic authentication sends only merchant credentials to the approved endpoint, caches and renews early", async () => {
  let now = 0,
    calls = 0;
  const manager = createGatewayTokenManager(
    (async (url, options) => {
      calls++;
      assert.equal(
        url,
        credentials.origin + "/transactionServices/REST/v1/authToken",
      );
      assert.equal(options?.method, "POST");
      assert.equal(options?.redirect, "error");
      const body = options?.body as URLSearchParams;
      assert.equal(body.get("authentication.memberId"), credentials.memberId);
      assert.ok(
        [credentials.workingKey, "rotated-unit-key"].includes(
          body.get("authentication.sKey")!,
        ),
      );
      assert.equal([...body.keys()].length, 2);
      return Response.json({ AuthToken: `unit-token-${calls}` });
    }) as typeof fetch,
    () => now,
  );
  const first = await Promise.all([manager(credentials), manager(credentials)]);
  assert.deepEqual(first, ["unit-token-1", "unit-token-1"]);
  assert.equal(calls, 1);
  now = 54 * 60000;
  assert.equal(await manager(credentials), "unit-token-1");
  now = 55 * 60000;
  assert.equal(await manager(credentials), "unit-token-2");
  assert.equal(
    await manager({ ...credentials, workingKey: "rotated-unit-key" }),
    "unit-token-3",
  );
  assert.equal(await manager(credentials, true), "unit-token-4");
  assert.equal(
    await manager({ ...credentials, authToken: "manual-unit-token" }),
    "manual-unit-token",
  );
  assert.equal(calls, 4);
});

test("authentication failures and malformed tokens are never cached or leaked, and untrusted hosts are rejected", async () => {
  let calls = 0;
  const manager = createGatewayTokenManager((async () => {
    calls++;
    if (calls === 1)
      return Response.json({ AuthToken: "unit-secret\ninvalid-header" });
    if (calls === 2) throw new Error(credentials.workingKey);
    if (calls === 3)
      return Response.json(
        { description: credentials.workingKey },
        { status: 403 },
      );
    return Response.json({ authToken: "valid-unit-token" });
  }) as typeof fetch);
  for (let i = 0; i < 3; i++) {
    await assert.rejects(manager(credentials), (error: Error) => {
      assert(!error.message.includes(credentials.workingKey));
      assert(!error.message.includes("unit-secret"));
      return /remains pending/.test(error.message);
    });
  }
  assert.equal(await manager(credentials), "valid-unit-token");
  assert.equal(calls, 4);
  await assert.rejects(
    manager({ ...credentials, origin: "https://untrusted.example" }),
    /Invalid payment gateway origin/,
  );
  await assert.rejects(
    manager({ ...credentials, workingKey: "" }),
    /not configured/,
  );
  assert.equal(calls, 4);
});

test("Inquiry automatically authenticates, retries an expired token once and still requires authoritative payment fields", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previous;
  });
  let tokens = 0,
    inquiries = 0;
  globalThis.fetch = (async (url, options) => {
    if (String(url).endsWith("/authToken"))
      return Response.json({ AuthToken: `integration-unit-token-${++tokens}` });
    assert.equal(
      url,
      credentials.origin + "/transactionServices/REST/v1/inquiry",
    );
    inquiries++;
    assert.equal(
      new Headers(options?.headers).get("AuthToken"),
      `integration-unit-token-${tokens}`,
    );
    const body = options?.body as URLSearchParams;
    assert.equal(body.get("paymentId"), "123456");
    assert.equal(body.has("authentication.sKey"), false);
    if (inquiries === 1) return new Response(null, { status: 401 });
    return Response.json({
      paymentId: "123456",
      merchantTransactionId: "a".repeat(64),
      amount: "25.00",
      currency: "EUR",
      status: "capturesuccess",
      transactionStatus: "Y",
    });
  }) as typeof fetch;
  const result = await inquirePayment("123456", {
    ...credentials,
    memberId: "inquiry-unit-merchant",
    toType: "Transactworld",
    language: "ENG",
    paymentBrand: "VISA",
    paymentMode: "CC",
    environment: "sandbox",
    redirectBase: "http://localhost:4000/return/",
    notificationBase: "http://localhost:4000/notify/",
  });
  assert.equal(result.status, "capturesuccess");
  assert.equal(tokens, 2);
  assert.equal(inquiries, 2);
});

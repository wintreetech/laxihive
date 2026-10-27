import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGatewayRequest,
  verifyNotification,
  requestChecksum,
  responseChecksum,
  decimalCents,
  gatewayReady,
  gatewaySetupIssues,
  verifyHostedResponse,
  gatewayConfig,
  gatewayInquiryAvailable,
  type TransactworldConfig,
} from "../src/services/transactworld.service.js";
const config: TransactworldConfig = {
  memberId: "1000",
  workingKey: "unit-test-key-only",
  toType: "Transactworld",
  language: "ENG",
  paymentBrand: "VISA",
  paymentMode: "CC",
  environment: "sandbox",
  origin: "https://sandbox.transactworld.com",
  redirectBase: "http://localhost:4000/api/payments/transactworld/return/",
  notificationBase: "http://localhost:4000/api/payments/forward/",
  authToken: "test-token",
};
const transaction = "c".repeat(64);
test("Transactworld form uses exact server USD amount and exposes no working key", () => {
  const form = buildGatewayRequest(
    {
      id: "payment",
      checkoutId: transaction,
      cents: 2500,
      coins: 1234,
      currency: "usd",
    },
    "::ffff:203.0.113.10",
    config,
  );
  assert.equal(
    form.forwardUrl,
    "https://sandbox.transactworld.com/transaction/Checkout",
  );
  assert.equal(form.paymentData.amount, "25.00");
  assert.equal(form.paymentData.currency, "USD");
  assert.equal("accountid" in form.paymentData, false);
  assert.equal("accountId" in form.paymentData, false);
  assert.equal(form.paymentData.paymentType, "DB");
  assert.equal(form.paymentData.ip, "203.0.113.10");
  assert.equal(
    form.paymentData.checksum,
    requestChecksum(
      config,
      "25.00",
      transaction,
      form.paymentData.merchantRedirectUrl,
    ),
  );
  assert.equal(JSON.stringify(form).includes(config.workingKey), false);
  assert.ok(form.paymentData.notificationUrl.endsWith(transaction));
});

test("EUR checkout preserves the stored currency in both gateway amount fields", () => {
  const form = buildGatewayRequest(
    {
      id: "eur-payment",
      checkoutId: transaction,
      cents: 1500,
      coins: 1500,
      currency: "eur",
    },
    "203.0.113.10",
    config,
  );
  assert.equal(form.paymentData.currency, "EUR");
  assert.equal(form.paymentData.TMPL_CURRENCY, "EUR");
  assert.equal(form.paymentData.amount, "15.00");
  assert.throws(() =>
    buildGatewayRequest(
      {
        id: "bad-payment",
        checkoutId: transaction,
        cents: 1500,
        coins: 1500,
        currency: "gbp",
      },
      "203.0.113.10",
      config,
    ),
  );
});
test("A merchant configured for EUR cannot initialize a USD checkout", () => {
  const merchant: TransactworldConfig = {
    ...config,
    supportedCurrencies: ["EUR"],
  };
  const payment = {
    id: "currency-guard",
    checkoutId: transaction,
    cents: 500,
    coins: 500,
    currency: "usd",
  };
  assert.equal(gatewayReady(merchant), true);
  assert.throws(
    () => buildGatewayRequest(payment, "203.0.113.10", merchant),
    /USD checkout is unavailable/,
  );
  assert.equal(
    buildGatewayRequest(
      { ...payment, currency: "eur" },
      "203.0.113.10",
      merchant,
    ).paymentData.currency,
    "EUR",
  );
});
test("Transactworld notifications authenticate the signed short status and exact transaction ID", () => {
  const body = {
    paymentId: "123456",
    merchantTransactionId: transaction,
    amount: "25.00",
    transactionStatus: "Y",
    checksum: responseChecksum(config, "123456", transaction, "25.00", "Y"),
  };
  assert.equal(
    verifyNotification(body, transaction, config).paymentId,
    "123456",
  );
  assert.throws(() =>
    verifyNotification({ ...body, amount: "250.00" }, transaction, config),
  );
  assert.throws(() =>
    verifyNotification(
      { ...body, transactionStatus: "N" },
      transaction,
      config,
    ),
  );
  assert.throws(() => verifyNotification(body, "d".repeat(64), config));
  assert.throws(() =>
    verifyNotification({ ...body, checksum: "bad" }, transaction, config),
  );
});
test("Hosted checkout is independent of inquiry credentials and requires valid callbacks", () => {
  assert.equal(gatewayReady(config), true);
  assert.equal(gatewayReady({ ...config, authToken: "" }), true);
  assert.equal(gatewayReady({ ...config, environment: "live" }), false);
  assert.equal(
    gatewayReady({
      ...config,
      environment: "live",
      origin: "https://secure.transactworld.com",
      redirectBase:
        "https://api.example.com/api/payments/transactworld/return/",
      notificationBase: "https://api.example.com/api/payments/forward/",
    }),
    true,
  );
  assert.equal(decimalCents("25.05"), 2505);
  for (const value of ["25", "25.000", "-25.00", "2e2", "NaN", 25])
    assert.throws(() => decimalCents(value));
});

test("Setup diagnostics identify missing settings without printing merchant secrets", () => {
  const issues = gatewaySetupIssues({
    ...config,
    environment: "live",
    origin: "https://secure.transactworld.com",
    authToken: "",
  });
  assert.equal(issues.length, 2);
  assert.equal(
    issues.some((i) => i.includes("TW_AUTH_TOKEN")),
    false,
  );
  assert.ok(issues.some((i) => i.includes("MERCHANT_REDIRECT_URL")));
  assert.ok(issues.some((i) => i.includes("NOTIFICATION_URL")));
  assert.equal(issues.join(" ").includes(config.workingKey), false);
  assert.equal(gatewayReady({ ...config, authToken: "  " }), true);
});

test("Local hosted checkout is explicit and production ignores the development setting", (t) => {
  assert.equal(
    gatewayReady({
      ...config,
      environment: "live",
      origin: "https://secure.transactworld.com",
      authToken: "",
      allowLocalCheckout: true,
    }),
    true,
  );
  const before = {
    node: process.env.NODE_ENV,
    local: process.env.TW_ALLOW_LOCAL_CHECKOUT,
    brand: process.env.PAYMENT_BRAND,
    mode: process.env.PAYMENT_MODE,
  };
  t.after(() => {
    for (const [key, value] of Object.entries({
      NODE_ENV: before.node,
      TW_ALLOW_LOCAL_CHECKOUT: before.local,
      PAYMENT_BRAND: before.brand,
      PAYMENT_MODE: before.mode,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.NODE_ENV = "production";
  process.env.TW_ALLOW_LOCAL_CHECKOUT = "true";
  process.env.PAYMENT_BRAND = "VISAs";
  process.env.PAYMENT_MODE = "1";
  const production = gatewayConfig();
  assert.equal(production.allowLocalCheckout, false);
  assert.equal(production.paymentBrand, "VISA");
  assert.equal(production.paymentMode, "CC");
});

test("Production supports automatic Inquiry authentication and rejects mismatched gateway origins", (t) => {
  const before = process.env.NODE_ENV;
  t.after(() => {
    if (before === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before;
  });
  process.env.NODE_ENV = "production";
  const live: TransactworldConfig = {
    ...config,
    environment: "live",
    origin: "https://secure.transactworld.com",
    redirectBase: "https://api.example.com/return/",
    notificationBase: "https://api.example.com/notify/",
    authToken: "",
  };
  assert.equal(gatewayReady(live), true);
  assert.equal(gatewayInquiryAvailable(live), true);
  assert.equal(gatewayInquiryAvailable({ ...live, workingKey: "" }), false);
  assert.equal(
    gatewaySetupIssues(live).some((i) => i.includes("TW_AUTH_TOKEN")),
    false,
  );
  assert.equal(
    gatewayReady({ ...live, authToken: "unit-inquiry-token" }),
    true,
  );
  assert.equal(
    gatewayReady({
      ...live,
      authToken: "unit-inquiry-token",
      origin: "https://untrusted.example",
    }),
    false,
  );
});

test("Hosted return authenticates the full status, not the short notification status", () => {
  const body = {
    paymentId: "123456",
    merchantTransactionId: transaction,
    amount: "25.00",
    currency: "EUR",
    status: "capturesuccess",
    checksum: responseChecksum(
      config,
      "123456",
      transaction,
      "25.00",
      "capturesuccess",
    ),
  };
  assert.equal(
    verifyHostedResponse(body, transaction, config).status,
    "capturesuccess",
  );
  assert.throws(() =>
    verifyHostedResponse(
      { ...body, status: "preauthsuccess" },
      transaction,
      config,
    ),
  );
  assert.throws(() =>
    verifyHostedResponse(
      {
        ...body,
        checksum: responseChecksum(config, "123456", transaction, "25.00", "Y"),
      },
      transaction,
      config,
    ),
  );
  assert.throws(() =>
    verifyHostedResponse({ ...body, amount: "250.00" }, transaction, config),
  );
});

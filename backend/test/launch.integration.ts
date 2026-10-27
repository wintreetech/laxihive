import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import request from "supertest";
process.loadEnvFile(".env");
const target = new URL(
  process.env.TEST_DATABASE_URL ||
    "mongodb://127.0.0.1:27018/lexihive_test?replicaSet=lexihive-local",
);
target.pathname = "/lexihive_launch_test";
process.env.DATABASE_URL = target.toString();
Object.assign(process.env, {
  NODE_ENV: "test",
  REQUIRE_EMAIL_VERIFICATION: "false",
  SESSION_SECRET: "launch-fixture-session-secret-not-real",
  PAYMENT_PROVIDER: "transactworld",
  PAYMENTS_ENABLED: "true",
  TW_ENVIRONMENT: "sandbox",
  MEMBER_ID: "fixture-merchant",
  WORKING_KEY: "fixture-working-key-not-real",
  TW_AUTH_TOKEN: "",
  TW_SUPPORTED_CURRENCIES: "EUR,USD",
  PUBLIC_API_URL: "http://localhost:4000",
  MERCHANT_REDIRECT_URL: "",
  NOTIFICATION_URL: "",
  PAYMENT_RECONCILIATION_ENABLED: "false",
  COIN_BASE_CURRENCY: "EUR",
});
delete process.env.FX_PROVIDER;
const { db } = await import("../src/config/database.js");
const { createApp } = await import("../src/app.js");
const { reconcileTransactworld } =
  await import("../src/services/transactworld.service.js");
const { maintenanceTick } =
  await import("../src/services/maintenance.service.js");
const app = createApp({ stripe: null });
const player = request.agent(app),
  admin = request.agent(app),
  reviewer = request.agent(app),
  unverifiedAdmin = request.agent(app);
const password = "an isolated launch test password";
let userId = "",
  adminId = "",
  reviewerId = "",
  csrf = "",
  adminCsrf = "",
  reviewerCsrf = "",
  unverifiedCsrf = "";
const post = (agent: any, token: string, path: string, body: any = {}) =>
  agent
    .post(`/api${path}`)
    .set("Origin", process.env.APP_ORIGIN!)
    .set("X-CSRF-Token", token)
    .send(body);
const balance = async () =>
  (await db.wallet.findUniqueOrThrow({ where: { userId } })).balance;
async function order(
  currency = "EUR",
  cents = 500,
  agent = player,
  token = csrf,
) {
  const quote = await post(agent, token, "/coins/quote", { currency, cents });
  assert.equal(quote.status, 201, JSON.stringify(quote.body));
  const checkout = await post(agent, token, "/payments/init", {
    quoteId: quote.body.id,
  });
  assert.equal(checkout.status, 200, JSON.stringify(checkout.body));
  return db.payment.findUniqueOrThrow({ where: { quoteId: quote.body.id } });
}
const evidence = (externalReference: string) => ({
  requestId: randomUUID(),
  externalReference,
  evidenceReference: "merchant-statement:fixture-document-001",
  explanation:
    "Independently matched captured merchant settlement to this exact order, customer, amount and currency.",
  password,
  confirmed: true,
});
const decision = {
  decision: "APPROVE",
  reason:
    "Independently checked the merchant statement and matching amount, currency and order.",
  password,
  confirmed: true,
};
const captured = (payment: any, id: string) => async () => ({
  paymentId: id,
  merchantTransactionId: payment.checkoutId!,
  currency: payment.currency.toUpperCase(),
  amount: (payment.cents / 100).toFixed(2),
  status: "capturesuccess",
  transactionStatus: "Y",
});
before(async () => {
  assert.equal(
    new URL(process.env.DATABASE_URL!).pathname,
    "/lexihive_launch_test",
  );
  await db.$runCommandRaw({ dropDatabase: 1 });
  const require = createRequire(new URL("../package.json", import.meta.url));
  const cli = join(
    dirname(require.resolve("prisma/package.json")),
    "build/index.js",
  );
  for (const args of [
    [cli, "db", "push", "--skip-generate"],
    ["--import", "tsx", "prisma/migrate.ts"],
    ["--import", "tsx", "prisma/seed.ts"],
  ]) {
    const result = spawnSync(process.execPath, args, {
      env: process.env,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr + result.stdout);
  }
  for (const [agent, email, role, verified] of [
    [player, "launch-player@fixture.invalid", "USER", false],
    [admin, "launch-admin@fixture.invalid", "ADMIN", true],
    [reviewer, "launch-reviewer@fixture.invalid", "ADMIN", true],
    [unverifiedAdmin, "unverified-admin@fixture.invalid", "ADMIN", false],
  ] as const) {
    const r = await post(agent, "", "/auth/register", {
      displayName: "Launch fixture",
      email,
      password,
      confirmPassword: password,
      terms: true,
    });
    assert.equal(r.status, 201);
    await db.user.update({
      where: { id: r.body.user.id },
      data: { role, ...(verified ? { verifiedAt: new Date() } : {}) },
    });
    if (agent === player) {
      userId = r.body.user.id;
      csrf = r.body.csrf;
    }
    if (agent === admin) {
      adminId = r.body.user.id;
      adminCsrf = r.body.csrf;
    }
    if (agent === reviewer) {
      reviewerId = r.body.user.id;
      reviewerCsrf = r.body.csrf;
    }
    if (agent === unverifiedAdmin) unverifiedCsrf = r.body.csrf;
  }
});
after(async () => {
  await db.$disconnect();
});
test("launch account policy, FX snapshots and independently reviewed settlements", async (t) => {
  await t.test(
    "optional verification does not send signup email or grant admin permissions",
    async () => {
      assert.equal(await db.authToken.count(), 0);
      const s = await player.get("/api/auth/session");
      assert.equal(s.body.user.verified, false);
      assert.equal(s.body.requireEmailVerification, false);
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: userId } })).verifiedAt,
        null,
      );
      assert.equal((await player.get("/api/admin/overview")).status, 403);
      assert.equal(
        (await unverifiedAdmin.get("/api/admin/overview")).status,
        403,
      );
      assert.equal(
        (
          await unverifiedAdmin
            .post("/api/admin/wallet-adjustment")
            .set("Origin", process.env.APP_ORIGIN!)
            .set("X-CSRF-Token", unverifiedCsrf)
            .send({})
        ).status,
        403,
      );
      const grant = await post(admin, adminCsrf, "/admin/wallet-adjustment", {
        userId,
        amount: 1000,
        requestId: randomUUID(),
        reason: "Isolated launch feature testing",
      });
      assert.equal(grant.status, 200);
      const expansion = (await player.get("/api/expansions")).body[0];
      assert.equal(
        (await post(player, csrf, `/expansions/${expansion.id}/unlock`)).status,
        200,
      );
      process.env.REQUIRE_EMAIL_VERIFICATION = "true";
      const quote = await post(player, csrf, "/coins/quote", {
        currency: "EUR",
        cents: 500,
      });
      assert.equal(
        (await post(player, csrf, "/payments/init", { quoteId: quote.body.id }))
          .status,
        403,
      );
      assert.equal(
        (await player.get("/api/auth/session")).body.user.verified,
        false,
      );
      process.env.REQUIRE_EMAIL_VERIFICATION = "false";
      assert.equal(
        (await post(player, csrf, "/payments/init", { quoteId: quote.body.id }))
          .status,
        200,
      );
    },
  );
  await t.test(
    "paid session authorization respects the email policy and refunds an unstarted purchase once",
    async () => {
      const setAccess = async (accessType: string, coinPrice: number) => {
        const current = await db.gameAccessConfig.findUniqueOrThrow({
          where: { id: "code-breaker:starter" },
        });
        const result = await admin
          .put("/api/admin/game-pricing/code-breaker/starter")
          .set("Origin", process.env.APP_ORIGIN!)
          .set("X-CSRF-Token", adminCsrf)
          .send({
            config: {
              accessType,
              coinPrice,
              trialSeconds: 30,
              sessionSeconds: 600,
              active: true,
            },
            publish: true,
            expectedVersion: current.version,
            reason: "Isolated optional-verification session test",
          });
        assert.equal(result.status, 200, JSON.stringify(result.body));
      };
      await setAccess("PAID_FROM_START", 25);
      try {
        const before = await balance();
        const session = await post(
          player,
          csrf,
          "/games/code-breaker/sessions",
          {
            requestId: randomUUID(),
            difficulty: "starter",
            level: 1,
            intent: "full",
          },
        );
        assert.equal(session.status, 201);
        const consent = {
          confirmedPrice: 25,
          pricingVersion: session.body.pricingVersion,
        };
        process.env.REQUIRE_EMAIL_VERIFICATION = "true";
        assert.equal(
          (
            await post(
              player,
              csrf,
              `/games/code-breaker/sessions/${session.body.id}/authorize`,
              consent,
            )
          ).status,
          403,
        );
        assert.equal(await balance(), before);
        process.env.REQUIRE_EMAIL_VERIFICATION = "false";
        assert.equal(
          (
            await post(
              player,
              csrf,
              `/games/code-breaker/sessions/${session.body.id}/authorize`,
              consent,
            )
          ).status,
          200,
        );
        assert.equal(await balance(), before - 25);
        assert.equal(
          (
            await post(
              player,
              csrf,
              `/games/code-breaker/sessions/${session.body.id}/authorize`,
              consent,
            )
          ).status,
          200,
        );
        assert.equal(await balance(), before - 25);
        assert.equal(
          (
            await post(
              player,
              csrf,
              `/games/code-breaker/sessions/${session.body.id}/cancel`,
            )
          ).status,
          200,
        );
        assert.equal(await balance(), before);
      } finally {
        process.env.REQUIRE_EMAIL_VERIFICATION = "false";
        await setAccess("FREE_FULL", 0);
      }
    },
  );
  await t.test(
    "a database display-status edit cannot credit coins",
    async () => {
      const p = await order(),
        before = await balance();
      await db.payment.update({
        where: { id: p.id },
        data: { status: "success" },
      });
      assert.equal(
        (await player.get(`/api/payments/${p.id}/status`)).body.credited,
        false,
      );
      assert.equal(await balance(), before);
      assert.equal(await db.purchase.count({ where: { paymentId: p.id } }), 0);
    },
  );
  await t.test(
    "manual settlement needs valid evidence, step-up and independent approval; retries and late captures credit once",
    async () => {
      const p = await order(),
        before = await balance(),
        proof = evidence("fixture-settlement-001");
      assert.equal(
        (
          await post(
            player,
            csrf,
            `/admin/payments/${p.id}/settlement-reviews`,
            proof,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await post(
            admin,
            adminCsrf,
            `/admin/payments/${p.id}/settlement-reviews`,
            { ...proof, evidenceReference: "none" },
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await post(
            admin,
            adminCsrf,
            `/admin/payments/${p.id}/settlement-reviews`,
            { ...proof, password: "wrong" },
          )
        ).status,
        403,
      );
      const r = await post(
        admin,
        adminCsrf,
        `/admin/payments/${p.id}/settlement-reviews`,
        proof,
      );
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(
        (
          await post(
            admin,
            adminCsrf,
            `/admin/payments/${p.id}/settlement-reviews`,
            proof,
          )
        ).body.id,
        r.body.id,
      );
      assert.equal(await balance(), before);
      assert.equal(
        (
          await post(
            admin,
            adminCsrf,
            `/admin/settlement-reviews/${r.body.id}/decision`,
            decision,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await post(
            reviewer,
            reviewerCsrf,
            `/admin/settlement-reviews/${r.body.id}/decision`,
            { ...decision, password: "wrong" },
          )
        ).status,
        403,
      );
      const approved = await post(
        reviewer,
        reviewerCsrf,
        `/admin/settlement-reviews/${r.body.id}/decision`,
        decision,
      );
      assert.equal(approved.status, 200, JSON.stringify(approved.body));
      assert.equal(await balance(), before + p.coins);
      assert.equal(
        (
          await post(
            reviewer,
            reviewerCsrf,
            `/admin/settlement-reviews/${r.body.id}/decision`,
            decision,
          )
        ).status,
        200,
      );
      const fulfilled = await db.payment.findUniqueOrThrow({
        where: { id: p.id },
      });
      assert.equal(fulfilled.fulfillmentSource, "MANUAL_SETTLEMENT");
      assert.equal(fulfilled.gatewayVerifiedAt, null);
      await reconcileTransactworld(
        { ...fulfilled, intentId: "gateway-late-fixture-001" },
        captured(p, "gateway-late-fixture-001"),
      );
      assert.equal(await balance(), before + p.coins);
      assert.equal(await db.purchase.count({ where: { paymentId: p.id } }), 1);
      assert.equal(
        await db.walletTransaction.count({
          where: { reference: `payment:transactworld:${p.id}` },
        }),
        1,
      );
      const audit = await db.adminAuditLog.findMany({
        where: { action: { startsWith: "payment.settlement" } },
      });
      assert.ok(audit.some((a) => a.actorId === adminId));
      assert.ok(audit.some((a) => a.actorId === reviewerId));
      const reused = await order(),
        rr = await post(
          admin,
          adminCsrf,
          `/admin/payments/${reused.id}/settlement-reviews`,
          evidence(proof.externalReference),
        );
      assert.equal(rr.status, 201);
      assert.equal(
        (
          await post(
            reviewer,
            reviewerCsrf,
            `/admin/settlement-reviews/${rr.body.id}/decision`,
            decision,
          )
        ).status,
        409,
      );
      assert.equal(
        (await db.payment.findUniqueOrThrow({ where: { id: reused.id } }))
          .credited,
        false,
      );
    },
  );
  await t.test(
    "concurrent gateway capture and independent approval share one fulfillment",
    async () => {
      const p = await order(),
        before = await balance();
      const r = await post(
        admin,
        adminCsrf,
        `/admin/payments/${p.id}/settlement-reviews`,
        evidence("fixture-concurrent-settlement-002"),
      );
      assert.equal(r.status, 201);
      const [approval] = await Promise.all([
        post(
          reviewer,
          reviewerCsrf,
          `/admin/settlement-reviews/${r.body.id}/decision`,
          decision,
        ),
        reconcileTransactworld(
          { ...p, intentId: "gateway-concurrent-fixture-002" },
          captured(p, "gateway-concurrent-fixture-002"),
        ),
      ]);
      assert.equal(approval.status, 200, JSON.stringify(approval.body));
      assert.equal(await balance(), before + p.coins);
      assert.equal(
        await db.walletTransaction.count({
          where: { reference: `payment:transactworld:${p.id}` },
        }),
        1,
      );
    },
  );
  await t.test(
    "rejected evidence does not settle orders and admins cannot review their own purchase",
    async () => {
      const p = await order(),
        before = await balance();
      const r = await post(
        admin,
        adminCsrf,
        `/admin/payments/${p.id}/settlement-reviews`,
        evidence("fixture-rejected-settlement-003"),
      );
      assert.equal(r.status, 201);
      assert.equal(
        (
          await post(
            reviewer,
            reviewerCsrf,
            `/admin/settlement-reviews/${r.body.id}/decision`,
            { ...decision, decision: "REJECT" },
          )
        ).status,
        200,
      );
      assert.equal(await balance(), before);
      assert.equal(
        (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).credited,
        false,
      );
      const owned = await order("EUR", 500, admin, adminCsrf);
      assert.equal(
        (
          await post(
            admin,
            adminCsrf,
            `/admin/payments/${owned.id}/settlement-reviews`,
            evidence("fixture-self-settlement-004"),
          )
        ).status,
        403,
      );
    },
  );
  await t.test(
    "admin recovery validates an entered provider reference before binding or fulfilling an order",
    async () => {
      const p = await order(),
        before = await balance(),
        originalFetch = globalThis.fetch,
        originalToken = process.env.TW_AUTH_TOKEN;
      let valid = false;
      process.env.TW_AUTH_TOKEN = "fixture-inquiry-token";
      globalThis.fetch = (async (url: any, options: any) => {
        assert.match(String(url), /transactionServices\/REST\/v1\/inquiry$/);
        assert.equal(options.headers.AuthToken, "fixture-inquiry-token");
        assert.equal(
          options.body.get("paymentId"),
          "gateway-admin-fixture-006",
        );
        return new Response(
          JSON.stringify({
            ...(await captured(p, "gateway-admin-fixture-006")()),
            amount: valid ? (p.cents / 100).toFixed(2) : "1.00",
          }),
        );
      }) as typeof fetch;
      try {
        const invalid = await post(
          admin,
          adminCsrf,
          `/admin/payments/${p.id}/reconcile`,
          { gatewayPaymentId: "gateway-admin-fixture-006" },
        );
        assert.equal(invalid.status, 400);
        assert.equal(
          (await db.payment.findUniqueOrThrow({ where: { id: p.id } }))
            .intentId,
          null,
        );
        assert.equal(await balance(), before);
        valid = true;
        assert.equal(
          (
            await post(admin, adminCsrf, `/admin/payments/${p.id}/reconcile`, {
              gatewayPaymentId: "gateway-admin-fixture-006",
            })
          ).status,
          200,
        );
        assert.equal(
          (await db.payment.findUniqueOrThrow({ where: { id: p.id } }))
            .intentId,
          "gateway-admin-fixture-006",
        );
        assert.equal(await balance(), before + p.coins);
      } finally {
        globalThis.fetch = originalFetch;
        process.env.TW_AUTH_TOKEN = originalToken;
      }
    },
  );
  await t.test(
    "FX quote and payment snapshots survive a changed reference rate",
    async () => {
      const asOf = new Date(
        new Date().toISOString().slice(0, 10) + "T00:00:00Z",
      );
      await db.fxRate.upsert({
        where: { id: "FRANKFURTER_ECB:EUR:USD" },
        update: { rate: "1.25", asOf, fetchedAt: new Date() },
        create: {
          id: "FRANKFURTER_ECB:EUR:USD",
          base: "EUR",
          quote: "USD",
          rate: "1.25",
          asOf,
          fetchedAt: new Date(),
          provider: "FRANKFURTER_ECB",
        },
      });
      const update = await admin
        .patch("/api/admin/coin-pricing")
        .set("Origin", process.env.APP_ORIGIN!)
        .set("X-CSRF-Token", adminCsrf)
        .send({
          minCents: 500,
          maxCents: 50000,
          stepCents: 500,
          coinsPerDollar: 100,
          coinsPerEuro: 100,
          enabled: true,
          pricingPolicy: "FX_BASED",
        });
      assert.equal(update.status, 200);
      const q = await post(player, csrf, "/coins/quote", {
        currency: "USD",
        cents: 2500,
      });
      assert.equal(q.status, 201);
      assert.equal(q.body.coins, 2000);
      assert.equal(q.body.baseCents, 2000);
      assert.equal(q.body.fxRate, "1.25");
      await db.fxRate.update({
        where: { id: "FRANKFURTER_ECB:EUR:USD" },
        data: { rate: "1.5" },
      });
      const checkout = await post(player, csrf, "/payments/init", {
        quoteId: q.body.id,
      });
      assert.equal(checkout.status, 200);
      const p = await db.payment.findUniqueOrThrow({
        where: { quoteId: q.body.id },
      });
      assert.equal(p.cents, 2500);
      assert.equal(p.currency, "usd");
      assert.equal(p.coins, 2000);
      assert.equal(p.fxRate, "1.25");
      const next = await post(player, csrf, "/coins/quote", {
        currency: "USD",
        cents: 2500,
      });
      assert.equal(next.body.coins, 1666);
      assert.equal(
        (
          await post(player, csrf, "/payments/init", {
            quoteId: q.body.id,
            amount: 1,
          })
        ).status,
        400,
      );
      const wrong = async () => ({
        ...(await captured(p, "gateway-fx-005")()),
        amount: "1.00",
      });
      await assert.rejects(
        reconcileTransactworld({ ...p, intentId: "gateway-fx-005" }, wrong),
        /amount or currency/,
      );
      assert.equal(
        (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).credited,
        false,
      );
      await reconcileTransactworld(
        { ...p, intentId: "gateway-fx-005" },
        captured(p, "gateway-fx-005"),
      );
      const report = await admin.get(
        "/api/admin/revenue-report?from=2020-01-01&to=2030-01-01",
      );
      assert.equal(report.status, 400);
      const today = new Date().toISOString().slice(0, 10);
      const current = await admin.get(
        `/api/admin/revenue-report?from=${today}&to=${today}`,
      );
      assert.equal(current.status, 200);
      assert.ok(
        current.body.sources.some((r: any) => r.source === "MANUAL_SETTLEMENT"),
      );
      assert.equal(current.body.baseCurrency, "eur");
    },
  );
  await t.test(
    "missing SMTP fails email-dependent features safely while optional account access remains available",
    async () => {
      const previous = {
        NODE_ENV: process.env.NODE_ENV,
        SMTP_HOST: process.env.SMTP_HOST,
        MAIL_FROM: process.env.MAIL_FROM,
      };
      Object.assign(process.env, {
        NODE_ENV: "production",
        SMTP_HOST: "",
        MAIL_FROM: "",
      });
      try {
        assert.equal(
          (
            await post(player, csrf, "/auth/forgot-password", {
              email: "unknown@fixture.invalid",
            })
          ).status,
          503,
        );
        assert.equal(
          (await post(player, csrf, "/auth/resend-verification")).status,
          503,
        );
        assert.equal((await player.get("/api/auth/session")).status, 200);
      } finally {
        Object.assign(process.env, previous);
      }
      const result = await maintenanceTick();
      assert.equal(result?.verificationConfigured, false);
    },
  );
});

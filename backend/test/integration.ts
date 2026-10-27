import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { MongoClient } from "mongodb";
import request from "supertest";
import Stripe from "stripe";
import { solve } from "../shared/solve.fixture.js";
import { campaignSeed } from "../shared/engine.js";
const backendRequire = createRequire(
  new URL("../package.json", import.meta.url),
);
const prismaCLI = join(
  dirname(backendRequire.resolve("prisma/package.json")),
  "build",
  "index.js",
);
process.loadEnvFile(".env");
process.env.REQUIRE_EMAIL_VERIFICATION = "true";
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "mongodb://127.0.0.1:27018/lexihive_test?replicaSet=lexihive-local";
assert.match(
  new URL(process.env.DATABASE_URL!).pathname,
  /_test$/,
  "Integration tests require an isolated database ending in _test",
);
process.env.SESSION_SECRET = "integration-only-secret-at-least-32-characters";
process.env.PAYMENTS_ENABLED = "true";
process.env.PAYMENT_PROVIDER = "stripe";
process.env.TW_SUPPORTED_CURRENCIES = "USD,EUR";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_integration_only";
const { db, atomic } = await import("../src/config/database.js");
const { digest } = await import("../src/middleware/auth.middleware.js");
const { ledger } = await import("../src/services/wallet.service.js");
const { createApp } = await import("../src/app.js");
const stripe = new Stripe("sk_test_integration_only");
let retrieved: any = {
  id: "pi_integration",
  currency: "usd",
  amount: 2500,
  amount_received: 2500,
  status: "succeeded",
  metadata: {},
  latest_charge: {
    id: "ch_integration",
    amount: 2500,
    amount_refunded: 0,
    disputed: false,
  },
};
let checkoutPayment = "";
stripe.checkout.sessions.create = async (params: any) => {
  checkoutPayment = params.metadata.paymentId;
  retrieved.metadata = params.metadata;
  return {
    id: `cs_${params.metadata.paymentId}`,
    url: "https://checkout.stripe.com/test-fixture",
    metadata: params.metadata,
    amount_total: 2500,
    currency: "usd",
  } as any;
};
stripe.paymentIntents.retrieve = async () => retrieved;
stripe.disputes.list = async () =>
  ({ data: [{ amount: 2500, status: "needs_response" }] }) as any;
const app = createApp({ stripe });
const agent = request.agent(app);
let csrf = "",
  userId = "",
  paymentId = "",
  checkoutId = "",
  unlockId = "";
const origin = () => process.env.APP_ORIGIN!;
const post = (path: string, data: unknown = {}) =>
  agent
    .post(`/api${path}`)
    .set("Origin", origin())
    .set("X-CSRF-Token", csrf)
    .send(data);
before(async () => {
  const mongo = new MongoClient(process.env.DATABASE_URL!);
  await mongo.connect();
  await mongo.db().dropDatabase();
  await mongo.close();
  for (const args of [
    [
      prismaCLI,
      "db",
      "push",
      "--schema",
      "prisma/schema.prisma",
      "--skip-generate",
    ],
    ["--import", "tsx", "prisma/migrate.ts"],
    ["--import", "tsx", "prisma/seed.ts"],
  ]) {
    const run = spawnSync(process.execPath, args, {
      encoding: "utf8",
      env: process.env,
    });
    assert.equal(run.status, 0, run.stderr + run.stdout);
  }
});
after(async () => {
  await db.$disconnect();
});
test("MongoDB-backed platform integration", async (t) => {
  await t.test(
    "health, public catalog, admin protection and invalid signup",
    async () => {
      assert.equal((await request(app).get("/api/health")).status, 200);
      assert.equal((await request(app).get("/api/games")).body.length, 20);
      assert.equal((await request(app).get("/api/admin/overview")).status, 401);
      assert.equal(
        (await post("/auth/register", { email: "bad" })).status,
        400,
      );
    },
  );
  await t.test(
    "signup issues an HttpOnly cookie and keeps financial state server-side",
    async () => {
      const r = await post("/auth/register", {
        displayName: "Integration player",
        email: "integration@example.com",
        password: "correct horse battery staple",
        confirmPassword: "correct horse battery staple",
        terms: true,
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.match(r.headers["set-cookie"][0], /HttpOnly/);
      csrf = r.body.csrf;
      userId = r.body.user.id;
      assert.equal(r.body.user.wallet.balance, 0);
      assert.equal(
        (
          await post("/auth/register", {
            displayName: "Repeat",
            email: "integration@example.com",
            password: "correct horse battery staple",
            confirmPassword: "correct horse battery staple",
            terms: true,
          })
        ).status,
        409,
      );
    },
  );
  await t.test(
    "sessions reject missing CSRF, wrong origin and normal-user admin access",
    async () => {
      assert.equal(
        (await agent.post("/api/auth/logout").set("Origin", origin()).send({}))
          .status,
        403,
      );
      assert.equal(
        (
          await agent
            .post("/api/auth/logout")
            .set("Origin", "https://attacker.invalid")
            .set("X-CSRF-Token", csrf)
            .send({})
        ).status,
        403,
      );
      assert.equal((await agent.get("/api/admin/overview")).status, 403);
      const s = await agent.get("/api/auth/session");
      assert.equal(s.body.user.id, userId);
    },
  );
  await t.test(
    "local verification links belong to the signed-in account and never appear in production",
    async (t) => {
      const nodemailer = (await import("nodemailer")).default;
      const prior = {
        node: process.env.NODE_ENV,
        host: process.env.SMTP_HOST,
        from: process.env.MAIL_FROM,
      };
      const mail = t.mock.method(
        nodemailer,
        "createTransport",
        () => ({ sendMail: async () => ({}) }) as any,
      );
      const log = t.mock.method(console, "log", () => {});
      try {
        assert.equal(
          (
            await request(app)
              .post("/api/auth/resend-verification")
              .set("Origin", origin())
              .send({})
          ).status,
          401,
        );
        process.env.NODE_ENV = "production";
        process.env.SMTP_HOST = "smtp.example.invalid";
        process.env.MAIL_FROM = "test@example.invalid";
        const production = await post("/auth/resend-verification");
        assert.equal(production.status, 200);
        assert.equal(production.body.developmentVerificationUrl, undefined);
        process.env.NODE_ENV = "development";
        process.env.SMTP_HOST = "";
        process.env.MAIL_FROM = "";
        const development = await post("/auth/resend-verification");
        assert.equal(development.status, 200);
        const link = new URL(development.body.developmentVerificationUrl);
        assert.equal(link.origin, origin());
        assert.equal(link.pathname, "/verify-email");
        assert.match(link.searchParams.get("token")!, /^[a-f0-9]{64}$/);
        assert.equal(development.headers["cache-control"], "no-store");
        assert.equal(
          (
            await db.authToken.findUniqueOrThrow({
              where: { id: digest(link.searchParams.get("token")!) },
            })
          ).userId,
          userId,
        );
      } finally {
        for (const [key, value] of Object.entries({
          NODE_ENV: prior.node,
          SMTP_HOST: prior.host,
          MAIL_FROM: prior.from,
        })) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        mail.mock.restore();
        log.mock.restore();
      }
    },
  );
  await t.test("email verification consumes its token once", async () => {
    const raw = "a".repeat(64);
    await db.authToken.create({
      data: {
        id: digest(raw),
        userId,
        kind: "verify",
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    assert.equal(
      (await post("/auth/verify-email", { token: raw })).status,
      200,
    );
    assert.equal(
      (await post("/auth/verify-email", { token: raw })).status,
      400,
    );
  });
  await t.test(
    "all 20 server-issued challenges save replay-validated progress",
    async () => {
      for (const g of await db.game.findMany()) {
        const r = await post(`/games/${g.slug}/sessions`, {});
        assert.equal(r.status, 201, `${g.slug}: ${JSON.stringify(r.body)}`);
        await db.gameSession.update({
          where: { id: r.body.id },
          data: { startedAt: new Date(Date.now() - 4000) },
        });
        const completion = await post(`/games/${g.slug}/complete`, {
          sessionId: r.body.id,
          actions: solve(g.slug, r.body.seed),
          score: 999999,
          coins: 999999,
        });
        assert.equal(
          completion.status,
          200,
          `${g.slug}: ${JSON.stringify(completion.body)}`,
        );
        assert.equal(completion.body.outcome, "won");
        assert.equal(completion.body.xp, 40);
        assert.ok(completion.body.score < 999999);
        assert.equal(
          (
            await post(`/games/${g.slug}/complete`, {
              sessionId: r.body.id,
              actions: [],
            })
          ).status,
          409,
        );
      }
      const d = await agent.get("/api/me/dashboard");
      assert.equal(d.body.progress.length, 20);
      assert.equal(d.body.user.profile.xp, 800);
      assert.equal(d.body.user.profile.streak, 1);
      assert.ok(d.body.user.wallet.balance >= 25);
    },
  );
  await t.test(
    "reward ceiling, daily replay and tampered completion are rejected or unrewarded",
    async () => {
      const r = await post("/games/daily-hive/sessions", {});
      await db.gameSession.update({
        where: { id: r.body.id },
        data: { startedAt: new Date(Date.now() - 3000) },
      });
      const done = await post("/games/daily-hive/complete", {
        sessionId: r.body.id,
        actions: solve("daily-hive", r.body.seed),
      });
      assert.equal(done.body.xp, 0);
      const invalid = await post("/games/word-guess/sessions", {});
      await db.gameSession.update({
        where: { id: invalid.body.id },
        data: { startedAt: new Date(Date.now() - 3000) },
      });
      assert.equal(
        (
          await post("/games/word-guess/complete", {
            sessionId: invalid.body.id,
            actions: [],
            score: 100000,
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "guest import validates replays and never credits coins or XP",
    async () => {
      const before = await db.wallet.findUniqueOrThrow({ where: { userId } });
      const profile = await db.userProfile.findUniqueOrThrow({
        where: { userId },
      });
      const r = await post("/me/import-progress", {
        records: [
          {
            slug: "word-scramble",
            seed: 42,
            actions: solve("word-scramble", 42),
          },
          {
            slug: "hive-quest",
            seed: campaignSeed(1),
            level: 1,
            actions: solve("hive-quest", campaignSeed(1)),
          },
          {
            slug: "hive-quest",
            seed: 42,
            level: 10,
            actions: solve("hive-quest", 42),
          },
        ],
      });
      assert.equal(r.status, 200);
      const campaignProgress = await db.userGameProgress.findUniqueOrThrow({
        where: { userId_gameSlug: { userId, gameSlug: "hive-quest" } },
      });
      assert.equal((campaignProgress.campaign as any)["starter:1"], 3);
      assert.equal((campaignProgress.campaign as any)["starter:10"], undefined);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId } })).balance,
        before.balance,
      );
      assert.equal(
        (await db.userProfile.findUniqueOrThrow({ where: { userId } })).xp,
        profile.xp,
      );
    },
  );
  await t.test(
    "pricing requires configuration and an authorized admin records pricing changes",
    async () => {
      await db.coinPricingConfig.update({
        where: { id: "global" },
        data: { enabled: false },
      });
      assert.equal(
        (await post("/coins/quote", { cents: 2500, coins: 99999 })).status,
        400,
      );
      await db.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
      const r = await agent
        .patch("/api/admin/coin-pricing")
        .set("Origin", origin())
        .set("X-CSRF-Token", csrf)
        .send({
          minCents: 500,
          maxCents: 50000,
          stepCents: 500,
          coinsPerDollar: 100,
          coinsPerEuro: 120,
          enabled: true,
        });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(
        await db.adminAuditLog.count({ where: { action: "pricing.update" } }),
        1,
      );
    },
  );
  await t.test(
    "quote and Checkout use authoritative prices, with repeat checkout idempotency",
    async () => {
      const quote = await post("/coins/quote", { cents: 2500, coins: 999999 });
      assert.equal(quote.status, 201);
      assert.equal(quote.body.coins, 2500);
      const checkout = await post("/payments/checkout", {
        quoteId: quote.body.id,
        coins: 999999,
      });
      assert.equal(checkout.status, 200, JSON.stringify(checkout.body));
      paymentId = checkout.body.paymentId;
      checkoutId = `cs_${paymentId}`;
      assert.equal(checkoutPayment, paymentId);
      const repeat = await post("/payments/checkout", {
        quoteId: quote.body.id,
      });
      assert.equal(repeat.body.paymentId, paymentId);
      assert.equal(
        (await db.payment.findUniqueOrThrow({ where: { id: paymentId } }))
          .credited,
        false,
      );
      const quote2 = await post("/coins/quote", { cents: 500 });
      assert.equal(
        (await post("/payments/checkout", { quoteId: quote2.body.id })).status,
        200,
      );
      retrieved = { ...retrieved, metadata: { paymentId, userId } };
    },
  );
  await t.test(
    "signed Stripe webhooks credit exactly once, including concurrent delivery",
    async () => {
      const initial = (await db.wallet.findUniqueOrThrow({ where: { userId } }))
        .balance;
      const event = {
        id: "evt_paid",
        type: "checkout.session.completed",
        livemode: false,
        data: {
          object: {
            id: checkoutId,
            metadata: { paymentId, userId },
            payment_intent: "pi_integration",
            payment_status: "paid",
          },
        },
      };
      const payload = JSON.stringify(event);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: process.env.STRIPE_WEBHOOK_SECRET!,
      });
      assert.equal(
        (
          await request(app)
            .post("/api/webhooks/stripe")
            .set("Content-Type", "application/json")
            .set("stripe-signature", "bad")
            .send(payload)
        ).status,
        400,
      );
      const deliver = () =>
        request(app)
          .post("/api/webhooks/stripe")
          .set("Content-Type", "application/json")
          .set("stripe-signature", signature)
          .send(payload);
      const results = await Promise.all([deliver(), deliver()]);
      for (const r of results)
        assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId } })).balance,
        initial + 2500,
      );
      assert.equal(
        await db.walletTransaction.count({
          where: { reference: `payment:${paymentId}` },
        }),
        1,
      );
      assert.equal(
        (await agent.get(`/api/payments/${paymentId}/status`)).body.status,
        "paid",
      );
    },
  );
  await t.test(
    "expansion debits and entitlements are atomic and idempotent",
    async () => {
      const expansion = await db.gameUnlock.findFirstOrThrow({
        where: { gameSlug: "slide-rush" },
      });
      unlockId = expansion.id;
      const before = (await db.wallet.findUniqueOrThrow({ where: { userId } }))
        .balance;
      const rs = await Promise.all([
        post(`/expansions/${unlockId}/unlock`),
        post(`/expansions/${unlockId}/unlock`),
      ]);
      for (const r of rs) assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId } })).balance,
        before - 500,
      );
      assert.equal(
        await db.userEntitlement.count({ where: { userId, unlockId } }),
        1,
      );
      assert.equal(
        (await post("/games/slide-rush/sessions", { difficulty: "advanced" }))
          .status,
        201,
      );
    },
  );
  await t.test(
    "concurrent overspending cannot produce negative balance",
    async () => {
      const balance = (await db.wallet.findUniqueOrThrow({ where: { userId } }))
        .balance;
      const results = await Promise.allSettled([
        atomic((tx) =>
          ledger(tx, userId, -balance, "spent", "race-a", "Concurrency test"),
        ),
        atomic((tx) =>
          ledger(tx, userId, -balance, "spent", "race-b", "Concurrency test"),
        ),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId } })).balance,
        0,
      );
    },
  );
  await t.test(
    "refund after spending creates auditable debt and pauses advanced access",
    async () => {
      retrieved.latest_charge.amount_refunded = 2500;
      const event = {
        id: "evt_refund",
        type: "charge.refunded",
        livemode: false,
        data: {
          object: { id: "ch_integration", payment_intent: "pi_integration" },
        },
      };
      const payload = JSON.stringify(event),
        signature = stripe.webhooks.generateTestHeaderString({
          payload,
          secret: process.env.STRIPE_WEBHOOK_SECRET!,
        });
      const r = await request(app)
        .post("/api/webhooks/stripe")
        .set("Content-Type", "application/json")
        .set("stripe-signature", signature)
        .send(payload);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const w = await db.wallet.findUniqueOrThrow({ where: { userId } });
      assert.equal(w.balance, 0);
      assert.equal(w.debt, 2500);
      assert.equal(
        (await post("/games/slide-rush/sessions", { difficulty: "advanced" }))
          .status,
        403,
      );
      assert.equal(
        (await agent.get(`/api/payments/${paymentId}/status`)).body.status,
        "refunded",
      );
    },
  );
  await t.test(
    "Hive Quest campaign levels unlock sequentially and keep stars separate from coins",
    async () => {
      const denied = await post("/games/hive-quest/sessions", { level: 3 });
      assert.equal(denied.status, 403);
      const next = await post("/games/hive-quest/sessions", { level: 2 });
      assert.equal(next.status, 201, JSON.stringify(next.body));
      await db.gameSession.update({
        where: { id: next.body.id },
        data: { startedAt: new Date(Date.now() - 3000) },
      });
      const result = await post("/games/hive-quest/complete", {
        sessionId: next.body.id,
        actions: solve("hive-quest", next.body.seed),
      });
      assert.equal(result.status, 200);
      const progress = await db.userGameProgress.findUniqueOrThrow({
        where: { userId_gameSlug: { userId, gameSlug: "hive-quest" } },
      });
      assert.equal(progress.stars, 6);
      assert.equal((progress.campaign as any)["starter:2"], 3);
      assert.equal(
        (await post("/games/hive-quest/sessions", { level: 3 })).status,
        201,
      );
    },
  );
  await t.test(
    "delayed Stripe success cannot reverse an already-processed refund",
    async () => {
      retrieved.latest_charge.amount_refunded = 0;
      const event = {
        id: "evt_stale_success",
        created: 1,
        type: "checkout.session.completed",
        livemode: false,
        data: {
          object: {
            id: checkoutId,
            metadata: { paymentId, userId },
            payment_intent: "pi_integration",
            payment_status: "paid",
          },
        },
      };
      const payload = JSON.stringify(event),
        signature = stripe.webhooks.generateTestHeaderString({
          payload,
          secret: process.env.STRIPE_WEBHOOK_SECRET!,
        });
      const r = await request(app)
        .post("/api/webhooks/stripe")
        .set("Content-Type", "application/json")
        .set("stripe-signature", signature)
        .send(payload);
      assert.equal(r.status, 200);
      assert.equal(
        (await db.payment.findUniqueOrThrow({ where: { id: paymentId } }))
          .status,
        "refunded",
      );
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId } })).debt,
        2500,
      );
    },
  );
  await t.test(
    "Transactworld init, authenticated callback, authoritative inquiry, duplicate delivery and refund",
    async () => {
      const { gatewayConfig, responseChecksum } =
        await import("../src/services/transactworld.service.js");
      process.env.PAYMENT_PROVIDER = "transactworld";
      process.env.TW_ENVIRONMENT = "sandbox";
      process.env.MEMBER_ID = "1000";
      process.env.WORKING_KEY = "integration-test-key-only";
      process.env.TW_AUTH_TOKEN = "test-token";
      let authoritative: any = null,
        calls = 0;
      const twApp = createApp({
        stripe: null,
        transactworldInquiry: async () => {
          calls++;
          return authoritative;
        },
      });
      const authCookie = `lexihive_session=${"e".repeat(64)}`;
      await db.session.create({
        data: {
          id: digest("e".repeat(64)),
          userId,
          csrf: "tw-csrf",
          expiresAt: new Date(Date.now() + 600000),
        },
      });
      const send = (path: string, data: any) =>
        request(twApp)
          .post("/api" + path)
          .set("Cookie", authCookie)
          .set("Origin", origin())
          .set("X-CSRF-Token", "tw-csrf")
          .send(data);
      assert.equal(
        (await send("/coins/quote", { cents: 2500, currency: "GBP" })).status,
        400,
      );
      const eurQuote = await send("/coins/quote", {
        cents: 2500,
        currency: "EUR",
      });
      assert.equal(eurQuote.status, 201);
      assert.equal(eurQuote.body.currency, "eur");
      assert.equal(eurQuote.body.coins, 3000);
      const eurInit = await send("/payments/init", {
        quoteId: eurQuote.body.id,
      });
      assert.equal(eurInit.status, 200, JSON.stringify(eurInit.body));
      assert.equal(eurInit.body.paymentData.currency, "EUR");
      assert.equal(
        (
          await db.payment.findUniqueOrThrow({
            where: { id: eurInit.body.paymentId },
          })
        ).currency,
        "eur",
      );
      const { reconcileTransactworld } =
        await import("../src/services/transactworld.service.js");
      const eurPayment = await db.payment.update({
        where: { id: eurInit.body.paymentId },
        data: { intentId: "987654321" },
      });
      const wrongCurrency = async () => ({
        paymentId: "987654321",
        merchantTransactionId: eurPayment.checkoutId!,
        amount: "25.00",
        currency: "USD",
        status: "capturesuccess",
        transactionStatus: "Y",
      });
      await assert.rejects(
        () => reconcileTransactworld(eurPayment, wrongCurrency),
        /currency does not match/,
      );
      const euroBalanceBefore = await db.wallet.findUniqueOrThrow({
        where: { userId },
      });
      await reconcileTransactworld(eurPayment, async () => ({
        ...(await wrongCurrency()),
        currency: "EUR",
      }));
      const euroBalanceAfter = await db.wallet.findUniqueOrThrow({
        where: { userId },
      });
      assert.equal(
        euroBalanceAfter.balance - euroBalanceAfter.debt,
        euroBalanceBefore.balance - euroBalanceBefore.debt + 3000,
      );
      assert.equal(
        (await db.payment.findUniqueOrThrow({ where: { id: eurPayment.id } }))
          .credited,
        true,
      );
      // Restore the same debt before the existing USD refund scenarios below.
      await ledger(
        db,
        userId,
        -3000,
        "test",
        "test:eur-revert",
        "Isolated EUR test cleanup",
        true,
      );
      const quote = await send("/coins/quote", { cents: 2500 });
      assert.equal(quote.status, 201);
      assert.equal(
        (
          await send("/payments/init", {
            quoteId: quote.body.id,
            amount: 1,
            credits: 999999,
          })
        ).status,
        400,
      );
      const init = await send("/payments/init", { quoteId: quote.body.id });
      assert.equal(init.status, 200, JSON.stringify(init.body));
      assert.equal(init.body.paymentData.amount, "25.00");
      assert.equal(init.body.paymentData.currency, "USD");
      assert.equal(
        init.body.forwardUrl,
        "https://sandbox.transactworld.com/transaction/Checkout",
      );
      assert.equal(
        JSON.stringify(init.body).includes(process.env.WORKING_KEY!),
        false,
      );
      const repeated = await send("/payments/checkout", {
        quoteId: quote.body.id,
      });
      assert.equal(
        repeated.body.paymentData.merchantTransactionId,
        init.body.paymentData.merchantTransactionId,
      );
      const transaction = init.body.paymentData.merchantTransactionId,
        pid = "7654321";
      const config = gatewayConfig();
      const callback: any = {
        paymentId: pid,
        merchantTransactionId: transaction,
        amount: "25.00",
        transactionStatus: "Y",
        status: "capturesuccess",
        checksum: responseChecksum(config, pid, transaction, "25.00", "Y"),
      };
      const notify = (value: any = callback) =>
        request(twApp)
          .post("/api/payments/forward/" + transaction)
          .type("form")
          .send(value);
      assert.equal(
        (await notify({ ...callback, checksum: "0".repeat(32) })).status,
        400,
      );
      assert.equal(calls, 0);
      authoritative = {
        paymentId: pid,
        merchantTransactionId: transaction,
        amount: "25.00",
        currency: "USD",
        status: "preauthsuccess",
        transactionStatus: "Y",
      };
      // A signed Y callback cannot mint coins from an unsigned display status: inquiry must show captured.
      const initial = (await db.wallet.findUniqueOrThrow({ where: { userId } }))
        .debt;
      assert.equal((await notify()).status, 200);
      assert.equal(
        (
          await db.payment.findUniqueOrThrow({
            where: { id: init.body.paymentId },
          })
        ).credited,
        false,
      );
      authoritative = { ...authoritative, status: "capturesuccess" };
      const results = await Promise.all([notify(), notify()]);
      for (const r of results)
        assert.equal(r.status, 200, JSON.stringify(r.body));
      const wallet = await db.wallet.findUniqueOrThrow({ where: { userId } });
      assert.equal(wallet.debt, Math.max(0, initial - 2500));
      assert.equal(
        await db.walletTransaction.count({
          where: { reference: "payment:transactworld:" + init.body.paymentId },
        }),
        1,
      );
      authoritative = {
        ...authoritative,
        status: "refundsuccess",
        refundamount: "25.00",
        chargebackamount: "0.00",
      };
      assert.equal((await notify()).status, 200);
      assert.equal(
        (
          await db.payment.findUniqueOrThrow({
            where: { id: init.body.paymentId },
          })
        ).status,
        "refunded",
      );
      const refundedWallet = await db.wallet.findUniqueOrThrow({
        where: { userId },
      });
      assert.equal(refundedWallet.balance, 0);
      assert.equal(refundedWallet.debt, 2500);
      authoritative = {
        ...authoritative,
        refundamount: "0.00",
        status: "capturesuccess",
      };
      assert.equal((await notify()).status, 200);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId } })).debt,
        2500,
      );
      const returned = await request(twApp)
        .post("/api/payments/transactworld/return/" + transaction)
        .type("form")
        .send({ status: "success", amount: "9999.00" });
      assert.equal(returned.status, 400);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId } })).debt,
        2500,
      );
      process.env.TW_AUTH_TOKEN = "";
      const hostedQuote = await send("/coins/quote", { cents: 500 });
      const unavailable = await send("/payments/init", {
        quoteId: hostedQuote.body.id,
      });
      assert.equal(unavailable.status, 200);
    },
  );
  await t.test(
    "Merchant currency limits reject unsupported quotes and previously issued checkouts",
    async () => {
      const prior = process.env.TW_SUPPORTED_CURRENCIES;
      const oldUSDQuote = await post("/coins/quote", {
        cents: 500,
        currency: "USD",
      });
      assert.equal(oldUSDQuote.status, 201);
      try {
        process.env.TW_SUPPORTED_CURRENCIES = "EUR";
        assert.deepEqual(
          (await request(app).get("/api/coins/config")).body.currencies,
          ["EUR"],
        );
        assert.equal(
          (await post("/coins/quote", { cents: 500, currency: "USD" })).status,
          400,
        );
        assert.equal(
          (await post("/payments/init", { quoteId: oldUSDQuote.body.id }))
            .status,
          400,
        );
        const defaultQuote = await post("/coins/quote", { cents: 500 });
        assert.equal(defaultQuote.status, 201);
        assert.equal(defaultQuote.body.currency, "eur");
      } finally {
        if (prior === undefined) delete process.env.TW_SUPPORTED_CURRENCIES;
        else process.env.TW_SUPPORTED_CURRENCIES = prior;
      }
    },
  );
  await t.test(
    "signed hosted return works without an inquiry token and credits only capture once",
    async () => {
      const { gatewayConfig, responseChecksum } =
        await import("../src/services/transactworld.service.js");
      process.env.TW_AUTH_TOKEN = "";
      const quote = await post("/coins/quote", { cents: 500, currency: "EUR" });
      assert.equal(quote.status, 201);
      const init = await post("/payments/init", { quoteId: quote.body.id });
      assert.equal(init.status, 200);
      const transaction = init.body.paymentData.merchantTransactionId;
      const path = `/api/payments/transactworld/return/${transaction}`;
      const c = gatewayConfig();
      const body = {
        paymentId: "1234098765",
        merchantTransactionId: transaction,
        amount: "5.00",
        currency: "EUR",
        status: "capturesuccess",
        checksum: responseChecksum(
          c,
          "1234098765",
          transaction,
          "5.00",
          "capturesuccess",
        ),
      };
      const baseline = await db.wallet.findUniqueOrThrow({ where: { userId } });
      assert.equal((await request(app).get(path)).status, 303);
      assert.equal(
        (
          await request(app)
            .post(path)
            .type("form")
            .send({ ...body, checksum: "0".repeat(32) })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(app)
            .post(path)
            .type("form")
            .send({ ...body, currency: "USD" })
        ).status,
        400,
      );
      const notify = await request(app)
        .post(`/api/payments/forward/${transaction}`)
        .type("form")
        .send({
          ...body,
          transactionStatus: "Y",
          checksum: responseChecksum(
            c,
            body.paymentId,
            transaction,
            body.amount,
            "Y",
          ),
        });
      assert.equal(notify.status, 200);
      assert.equal(
        (
          await db.payment.findUniqueOrThrow({
            where: { id: init.body.paymentId },
          })
        ).credited,
        false,
      );
      const authOnly = {
        ...body,
        status: "preauthsuccess",
        checksum: responseChecksum(
          c,
          body.paymentId,
          transaction,
          body.amount,
          "preauthsuccess",
        ),
      };
      assert.equal(
        (await request(app).post(path).type("form").send(authOnly)).status,
        303,
      );
      assert.equal(
        (
          await db.payment.findUniqueOrThrow({
            where: { id: init.body.paymentId },
          })
        ).credited,
        false,
      );
      const results = await Promise.all([
        request(app).post(path).type("form").send(body),
        request(app).post(path).type("form").send(body),
      ]);
      for (const r of results)
        assert.equal(r.status, 303, JSON.stringify(r.body));
      const after = await db.wallet.findUniqueOrThrow({ where: { userId } });
      assert.equal(
        after.balance - after.debt,
        baseline.balance - baseline.debt + quote.body.coins,
      );
      assert.equal(
        await db.walletTransaction.count({
          where: { reference: `payment:transactworld:${init.body.paymentId}` },
        }),
        1,
      );
      assert.equal(
        (await agent.get(`/api/payments/${init.body.paymentId}/status`)).body
          .canReconcile,
        false,
      );
    },
  );
  await t.test(
    "production generates its own token and verifies USD/EUR notifications before exactly-once fulfillment",
    async () => {
      const { gatewayConfig, responseChecksum } =
        await import("../src/services/transactworld.service.js");
      const prior = {
        NODE_ENV: process.env.NODE_ENV,
        PUBLIC_API_URL: process.env.PUBLIC_API_URL,
        TW_ENVIRONMENT: process.env.TW_ENVIRONMENT,
        TW_AUTH_TOKEN: process.env.TW_AUTH_TOKEN,
      };
      const previousFetch = globalThis.fetch;
      let authCalls = 0;
      let inquiryResponse: any;
      let outage = false;
      try {
        Object.assign(process.env, {
          NODE_ENV: "production",
          PUBLIC_API_URL: "https://api.example.com",
          TW_ENVIRONMENT: "live",
          TW_AUTH_TOKEN: "",
        });
        const config = gatewayConfig();
        globalThis.fetch = (async (url, options) => {
          assert.equal(options?.redirect, "error");
          if (String(url).endsWith("/authToken")) {
            authCalls++;
            const body = options?.body as URLSearchParams;
            assert.equal(body.get("authentication.memberId"), config.memberId);
            assert.equal(body.get("authentication.sKey"), config.workingKey);
            return Response.json({
              AuthToken: "production-integration-token-only",
            });
          }
          assert.equal(
            url,
            config.origin + "/transactionServices/REST/v1/inquiry",
          );
          assert.equal(
            new Headers(options?.headers).get("AuthToken"),
            "production-integration-token-only",
          );
          if (outage) return new Response(null, { status: 503 });
          return Response.json(inquiryResponse);
        }) as typeof fetch;
        for (const currency of ["USD", "EUR"]) {
          const quote = await post("/coins/quote", { cents: 500, currency });
          assert.equal(quote.status, 201, JSON.stringify(quote.body));
          const init = await post("/payments/init", { quoteId: quote.body.id });
          assert.equal(init.status, 200, JSON.stringify(init.body));
          const transaction = init.body.paymentData.merchantTransactionId;
          const body = {
            paymentId: currency === "USD" ? "2468101" : "2468102",
            merchantTransactionId: transaction,
            amount: "5.00",
            transactionStatus: "Y",
            checksum: "",
          };
          body.checksum = responseChecksum(
            config,
            body.paymentId,
            transaction,
            body.amount,
            "Y",
          );
          const callback = () =>
            request(app)
              .post(`/api/payments/forward/${transaction}`)
              .type("form")
              .send(body);
          const before = await db.wallet.findUniqueOrThrow({
            where: { userId },
          });
          const unchanged = async () => {
            const wallet = await db.wallet.findUniqueOrThrow({
              where: { userId },
            });
            assert.equal(
              wallet.balance - wallet.debt,
              before.balance - before.debt,
            );
            assert.equal(
              (
                await db.payment.findUniqueOrThrow({
                  where: { id: init.body.paymentId },
                })
              ).credited,
              false,
            );
          };
          outage = true;
          assert.equal((await callback()).status, 503);
          await unchanged();
          outage = false;
          inquiryResponse = { ...body, currency, status: "preauthsuccess" };
          assert.equal((await callback()).status, 200);
          await unchanged();
          inquiryResponse = {
            ...inquiryResponse,
            currency: currency === "USD" ? "EUR" : "USD",
            status: "capturesuccess",
          };
          assert.equal((await callback()).status, 400);
          await unchanged();
          inquiryResponse.currency = currency;
          const delivered = await Promise.all([callback(), callback()]);
          for (const response of delivered)
            assert.equal(response.status, 200, JSON.stringify(response.body));
          const returnBody = {
            ...body,
            currency,
            status: "capturesuccess",
            checksum: responseChecksum(
              config,
              body.paymentId,
              transaction,
              body.amount,
              "capturesuccess",
            ),
          };
          assert.equal(
            (
              await request(app)
                .post(`/api/payments/transactworld/return/${transaction}`)
                .type("form")
                .send(returnBody)
            ).status,
            303,
          );
          const after = await db.wallet.findUniqueOrThrow({
            where: { userId },
          });
          assert.equal(
            after.balance - after.debt,
            before.balance - before.debt + quote.body.coins,
          );
          assert.equal(
            await db.walletTransaction.count({
              where: {
                reference: `payment:transactworld:${init.body.paymentId}`,
              },
            }),
            1,
          );
        }
        assert.equal(
          authCalls,
          1,
          "The generated token is reused for both currencies and repeated callbacks",
        );
      } finally {
        globalThis.fetch = previousFetch;
        for (const [key, value] of Object.entries(prior)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    },
  );
  await t.test(
    "password reset revokes sessions, then login and logout work",
    async () => {
      const raw = "b".repeat(64);
      await db.authToken.create({
        data: {
          id: digest(raw),
          userId,
          kind: "reset",
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      assert.equal(
        (
          await post("/auth/reset-password", {
            token: raw,
            password: "a new secure long password",
          })
        ).status,
        200,
      );
      assert.equal((await agent.get("/api/auth/session")).body.user, null);
      const r = await post("/auth/login", {
        email: "integration@example.com",
        password: "a new secure long password",
      });
      assert.equal(r.status, 200);
      csrf = r.body.csrf;
      assert.equal((await post("/auth/logout")).status, 200);
      assert.equal((await agent.get("/api/auth/session")).body.user, null);
    },
  );
});

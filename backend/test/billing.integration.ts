import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { solve } from "../shared/solve.fixture.js";
process.loadEnvFile(".env");
process.env.REQUIRE_EMAIL_VERIFICATION = "true";
const url = new URL(
  process.env.TEST_DATABASE_URL ||
    "mongodb://127.0.0.1:27018/lexihive_test?replicaSet=lexihive-local",
);
url.pathname = url.pathname.replace(/_test$/, "") + "_billing_test";
assert.match(url.pathname, /_billing_test$/);
process.env.DATABASE_URL = url.toString();
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "billing-integration-secret-not-for-production";
process.env.PAYMENT_RECONCILIATION_ENABLED = "false";
const { db, atomic } = await import("../src/config/database.js");
const { ledger } = await import("../src/services/wallet.service.js");
const { refundUnstartedSessions } =
  await import("../src/services/game-access.service.js");
const { createApp } = await import("../src/app.js");
const { reconcileTransactworld } =
  await import("../src/services/transactworld.service.js");
const { verifiedRevenueTotals } =
  await import("../src/services/reporting.service.js");
const app = createApp({ stripe: null });
const admin = request.agent(app),
  player = request.agent(app),
  poor = request.agent(app);
let adminId = "",
  playerId = "",
  poorId = "",
  adminCsrf = "",
  playerCsrf = "",
  poorCsrf = "";
const password = "a billing integration password";
const post = (agent: any, csrf: string, path: string, body: any = {}) =>
  agent
    .post(`/api${path}`)
    .set("Origin", process.env.APP_ORIGIN!)
    .set("X-CSRF-Token", csrf)
    .send(body);
const edit = (path: string, body: any, method = "put") =>
  (admin as any)
    [method](`/api/admin${path}`)
    .set("Origin", process.env.APP_ORIGIN!)
    .set("X-CSRF-Token", adminCsrf)
    .send(body);
const config = (coinPrice = 50, accessType = "FREE_TRIAL_THEN_PAID") => ({
  accessType,
  coinPrice,
  trialSeconds: 30,
  sessionSeconds: 600,
  active: true,
});
const wallet = () =>
  db.wallet.findUniqueOrThrow({ where: { userId: playerId } });
async function pricing(
  slug: string,
  c = config(),
  publish = true,
  mode = "starter",
) {
  const current = await db.gameAccessConfig.findUnique({
    where: { id: `${slug}:${mode}` },
  });
  const r = await edit(`/game-pricing/${slug}/${mode}`, {
    config: c,
    publish,
    expectedVersion: current?.version ?? 0,
    reason: "Integration pricing review",
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
async function start(
  slug: string,
  intent = "full",
  agent = player,
  csrf = playerCsrf,
  mode = "starter",
) {
  const r = await post(agent, csrf, `/games/${slug}/sessions`, {
    difficulty: mode,
    level: 1,
    requestId: randomUUID(),
    intent,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
before(async () => {
  // Only this dedicated fixture database may be reset.
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /_billing_test$/);
  await db.$runCommandRaw({ dropDatabase: 1 });
  const require = createRequire(new URL("../package.json", import.meta.url));
  const cli = join(
    dirname(require.resolve("prisma/package.json")),
    "build/index.js",
  );
  const push = spawnSync(
    process.execPath,
    [cli, "db", "push", "--skip-generate"],
    {
      cwd: new URL("../", import.meta.url),
      env: process.env,
      encoding: "utf8",
    },
  );
  assert.equal(push.status, 0, push.stderr);
  const seed = spawnSync(
    process.execPath,
    ["--import", "tsx", "prisma/seed.ts"],
    {
      cwd: new URL("../", import.meta.url),
      env: { ...process.env, ADMIN_EMAIL: "" },
      encoding: "utf8",
    },
  );
  assert.equal(seed.status, 0, seed.stderr);
  for (const [agent, email] of [
    [admin, "billing-admin@example.com"],
    [player, "billing-player@example.com"],
    [poor, "billing-poor@example.com"],
  ] as const) {
    const r = await post(agent, "", "/auth/register", {
      displayName: "Billing player",
      email,
      password,
      confirmPassword: password,
      terms: true,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    await db.user.update({
      where: { id: r.body.user.id },
      data: { verifiedAt: new Date() },
    });
    if (agent === admin) {
      adminId = r.body.user.id;
      adminCsrf = r.body.csrf;
    }
    if (agent === player) {
      playerId = r.body.user.id;
      playerCsrf = r.body.csrf;
    }
    if (agent === poor) {
      poorId = r.body.user.id;
      poorCsrf = r.body.csrf;
    }
  }
  const provision = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/jobs/provision-admin.ts",
      "--email",
      "billing-admin@example.com",
    ],
    { env: process.env, encoding: "utf8" },
  );
  assert.equal(provision.status, 0, provision.stderr);
});
after(async () => {
  await db.$disconnect();
});
test("game billing, administrator controls and protected wallet accounting", async (t) => {
  await t.test(
    "safe rollout keeps all 20 starter modes free and proposals unpublished",
    async () => {
      assert.equal(
        await db.gameAccessConfig.count({
          where: { mode: "starter", accessType: "FREE_FULL", coinPrice: 0 },
        }),
        20,
      );
      assert.equal(
        await db.gameAccessConfig.count({
          where: { publishedAt: { not: null } },
        }),
        0,
      );
      assert.equal((await player.get("/api/games")).body.length, 20);
    },
  );
  await t.test(
    "first admin provisioning cannot be reused and ordinary users cannot escalate",
    async () => {
      const again = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/jobs/provision-admin.ts",
          "--email",
          "billing-poor@example.com",
        ],
        { env: process.env, encoding: "utf8" },
      );
      assert.equal(again.status, 1);
      assert.equal((await player.get("/api/admin/users")).status, 403);
      assert.equal(
        (
          await post(player, playerCsrf, "/admin/wallet-adjustment", {
            userId: playerId,
            amount: 500,
            requestId: randomUUID(),
            reason: "Unauthorized adjustment",
          })
        ).status,
        403,
      );
    },
  );
  await t.test(
    "free full game issues a server seed, saves a win and charges nothing",
    async () => {
      const s = await start("number-rush");
      assert.equal(s.seed, undefined);
      const r = await post(
        player,
        playerCsrf,
        `/games/number-rush/sessions/${s.id}/ready`,
      );
      assert.equal(r.body.billingState, "ACTIVE");
      await db.gameSession.update({
        where: { id: s.id },
        data: { readyAt: new Date(Date.now() - 3000) },
      });
      const done = await post(
        player,
        playerCsrf,
        "/games/number-rush/complete",
        { sessionId: s.id, actions: solve("number-rush", r.body.seed) },
      );
      assert.equal(done.status, 200, JSON.stringify(done.body));
      assert.equal(done.body.xp, 40);
      assert.equal((await wallet()).balance, 25);
      assert.equal(
        await db.walletTransaction.count({
          where: { reference: `game-session:${s.id}` },
        }),
        0,
      );
      assert.equal(
        (
          await post(player, playerCsrf, "/games/number-rush/complete", {
            sessionId: s.id,
            actions: [],
          })
        ).status,
        409,
      );
    },
  );
  await t.test(
    "saving a draft never changes live access and publication is audited",
    async () => {
      await pricing("word-search", config(), false);
      assert.equal(
        (await player.get("/api/games/word-search")).body.access.accessType,
        "FREE_FULL",
      );
      await pricing("word-search");
      assert.equal(
        (await player.get("/api/games/word-search")).body.access.coinPrice,
        50,
      );
      assert.equal(
        await db.adminAuditLog.count({
          where: { action: "game.pricing.publish" },
        }),
        1,
      );
    },
  );
  let trial: any;
  await t.test(
    "trial starts only when ready; repeated preview creation returns the same grant",
    async () => {
      const baseline = (await wallet()).balance;
      trial = await start("word-search", "preview");
      assert.equal(trial.billingState, "CREATED");
      assert.equal(trial.trialExpiresAt, null);
      const r = await post(
        player,
        playerCsrf,
        `/games/word-search/sessions/${trial.id}/ready`,
      );
      trial = r.body;
      assert.equal(trial.billingState, "TRIAL_ACTIVE");
      assert.equal(
        Date.parse(trial.trialExpiresAt) - Date.parse(trial.trialStartedAt),
        30000,
      );
      assert.equal((await start("word-search", "preview")).id, trial.id);
      assert.equal((await wallet()).balance, baseline);
    },
  );
  await t.test(
    "authoritative expiry blocks completion and never deducts coins",
    async () => {
      const baseline = (await wallet()).balance;
      await db.gameSession.update({
        where: { id: trial.id },
        data: {
          trialExpiresAt: new Date(Date.now() - 1),
          expiresAt: new Date(Date.now() - 1),
        },
      });
      assert.equal(
        (await player.get(`/api/games/word-search/sessions/${trial.id}`)).body
          .billingState,
        "TRIAL_EXPIRED",
      );
      assert.equal(
        (
          await post(player, playerCsrf, "/games/word-search/complete", {
            sessionId: trial.id,
            actions: solve("word-search", trial.seed),
          })
        ).status,
        409,
      );
      assert.equal((await wallet()).balance, baseline);
      assert.equal(
        await db.userGameProgress.count({
          where: { userId: playerId, gameSlug: "word-search" },
        }),
        0,
      );
    },
  );
  await t.test(
    "price tampering, unrelated routes and insufficient balances cannot authorize play",
    async () => {
      assert.equal(
        (
          await post(
            player,
            playerCsrf,
            `/games/word-search/sessions/${trial.id}/authorize`,
            { confirmedPrice: 1, pricingVersion: trial.pricingVersion },
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await post(
            player,
            playerCsrf,
            `/games/code-breaker/sessions/${trial.id}/ready`,
          )
        ).status,
        404,
      );
      const s = await start("word-search", "full", poor, poorCsrf);
      assert.equal(
        (
          await post(
            poor,
            poorCsrf,
            `/games/word-search/sessions/${s.id}/authorize`,
            { confirmedPrice: 50, pricingVersion: s.pricingVersion },
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await post(
            poor,
            poorCsrf,
            `/games/word-search/sessions/${s.id}/ready`,
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "explicit continuation charges once under concurrent retries and freezes agreed pricing",
    async () => {
      await atomic((tx) =>
        ledger(
          tx,
          playerId,
          200,
          "admin",
          "fixture:billing-credit",
          "Isolated test funding",
        ),
      );
      await pricing("word-search", config(75));
      const before = await wallet(),
        body = { confirmedPrice: 50, pricingVersion: trial.pricingVersion };
      const replies = await Promise.all([
        post(
          player,
          playerCsrf,
          `/games/word-search/sessions/${trial.id}/authorize`,
          body,
        ),
        post(
          player,
          playerCsrf,
          `/games/word-search/sessions/${trial.id}/authorize`,
          body,
        ),
      ]);
      for (const r of replies)
        assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(before.balance - (await wallet()).balance, 50);
      assert.equal(
        await db.walletTransaction.count({
          where: { reference: `game-session:${trial.id}` },
        }),
        1,
      );
      const ready = await post(
        player,
        playerCsrf,
        `/games/word-search/sessions/${trial.id}/ready`,
      );
      const again = await post(
        player,
        playerCsrf,
        `/games/word-search/sessions/${trial.id}/ready`,
      );
      assert.equal(ready.body.startedAt, again.body.startedAt);
      assert.equal(ready.body.coinPrice, 50);
      assert.equal(ready.body.billingState, "ACTIVE");
      assert.equal(
        (await player.get(`/api/games/word-search/sessions/${trial.id}`)).body
          .coinPrice,
        50,
      );
    },
  );
  await t.test(
    "paid results retain server replay and are excluded from ranked play",
    async () => {
      const s = await db.gameSession.findUniqueOrThrow({
        where: { id: trial.id },
      });
      await db.gameSession.update({
        where: { id: s.id },
        data: { readyAt: new Date(Date.now() - 3000) },
      });
      const r = await post(player, playerCsrf, "/games/word-search/complete", {
        sessionId: s.id,
        actions: solve("word-search", s.seed),
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.xp, 40);
      assert.equal(
        (await db.gameSession.findUniqueOrThrow({ where: { id: s.id } }))
          .ranked,
        false,
      );
      assert.equal(
        (
          await post(
            player,
            playerCsrf,
            `/games/word-search/sessions/${s.id}/authorize`,
            { confirmedPrice: 50, pricingVersion: s.pricingVersion },
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "completed previews award no score, XP, progress, achievements or coins",
    async () => {
      const s = await start("word-search", "preview", poor, poorCsrf);
      const r = await post(
        poor,
        poorCsrf,
        `/games/word-search/sessions/${s.id}/ready`,
      );
      await db.gameSession.update({
        where: { id: s.id },
        data: { readyAt: new Date(Date.now() - 3000) },
      });
      const done = await post(poor, poorCsrf, "/games/word-search/complete", {
        sessionId: s.id,
        actions: solve("word-search", r.body.seed),
      });
      assert.equal(done.status, 200, JSON.stringify(done.body));
      assert.equal(done.body.practice, true);
      assert.equal(done.body.xp, 0);
      assert.equal(done.body.score, 0);
      assert.equal(
        await db.userGameProgress.count({ where: { userId: poorId } }),
        0,
      );
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId: poorId } }))
          .balance,
        0,
      );
      assert.equal(
        (
          await post(poor, poorCsrf, "/games/word-search/sessions", {
            difficulty: "starter",
            level: 1,
            intent: "preview",
            requestId: randomUUID(),
          })
        ).status,
        409,
      );
    },
  );
  await t.test(
    "unstarted purchases refund once and scheduled expiry recovers failed launches",
    async () => {
      const before = (await wallet()).balance;
      const s = await start("word-search");
      assert.equal(
        (
          await post(
            player,
            playerCsrf,
            `/games/word-search/sessions/${s.id}/authorize`,
            { confirmedPrice: 75, pricingVersion: s.pricingVersion },
          )
        ).status,
        200,
      );
      await db.gameSession.update({
        where: { id: s.id },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      assert.equal(
        (
          await post(
            player,
            playerCsrf,
            `/games/word-search/sessions/${s.id}/ready`,
          )
        ).status,
        409,
      );
      await refundUnstartedSessions();
      await refundUnstartedSessions();
      assert.equal((await wallet()).balance, before);
      assert.equal(
        await db.walletTransaction.count({
          where: { reference: `game-session-refund:${s.id}` },
        }),
        1,
      );
      assert.equal(
        (
          await post(
            player,
            playerCsrf,
            `/games/word-search/sessions/${s.id}/authorize`,
            { confirmedPrice: 75, pricingVersion: s.pricingVersion },
          )
        ).status,
        409,
      );
    },
  );
  await t.test("concurrent session purchases cannot overspend", async () => {
    await pricing("code-breaker", config(100, "PAID_FROM_START"));
    const w = await wallet();
    await atomic((tx) =>
      ledger(
        tx,
        playerId,
        150 - w.balance,
        "admin",
        "fixture:set-150",
        "Isolated concurrency fixture",
      ),
    );
    const a = await start("code-breaker"),
      b = await start("code-breaker");
    const replies = await Promise.all(
      [a, b].map((s) =>
        post(
          player,
          playerCsrf,
          `/games/code-breaker/sessions/${s.id}/authorize`,
          { confirmedPrice: 100, pricingVersion: s.pricingVersion },
        ),
      ),
    );
    assert.deepEqual(replies.map((r) => r.status).sort(), [200, 409]);
    assert.equal((await wallet()).balance, 50);
  });
  await t.test(
    "existing permanent owners are not charged after advanced pricing changes",
    async () => {
      const unlock = await db.gameUnlock.findUniqueOrThrow({
        where: { gameSlug: "hive-quest" },
      });
      await db.userEntitlement.create({
        data: { userId: playerId, unlockId: unlock.id },
      });
      await pricing(
        "hive-quest",
        config(100, "PREMIUM_SESSION"),
        true,
        "advanced",
      );
      const before = (await wallet()).balance,
        s = await start("hive-quest", "full", player, playerCsrf, "advanced");
      assert.equal(s.coinPrice, 0);
      assert.equal(s.accessType, "PERMANENT_UNLOCK");
      assert.equal((await wallet()).balance, before);
    },
  );
  await t.test(
    "admin credits, duplicate keys and target corrections are audited",
    async () => {
      const before = (await wallet()).balance,
        requestId = randomUUID();
      const body = {
        userId: playerId,
        amount: 20,
        reason: "Customer support test adjustment",
        requestId,
      };
      for (let i = 0; i < 2; i++)
        assert.equal(
          (await post(admin, adminCsrf, "/admin/wallet-adjustment", body))
            .status,
          200,
        );
      assert.equal((await wallet()).balance, before + 20);
      assert.equal(
        (
          await post(admin, adminCsrf, "/admin/wallet-adjustment", {
            ...body,
            amount: 30,
          })
        ).status,
        409,
      );
      const w = await wallet();
      assert.equal(
        (
          await post(admin, adminCsrf, "/admin/wallet-adjustment", {
            userId: playerId,
            targetBalance: 90,
            expectedBalance: w.balance,
            expectedDebt: w.debt,
            requestId: randomUUID(),
            reason: "Audited target correction",
          })
        ).status,
        200,
      );
      assert.equal((await wallet()).balance, 90);
      assert.equal(
        (
          await post(admin, adminCsrf, "/admin/wallet-adjustment", {
            ...body,
            amount: 20000,
            requestId: randomUUID(),
          })
        ).status,
        403,
      );
      assert.equal(
        await db.adminAuditLog.count({ where: { action: "wallet.adjust" } }),
        2,
      );
    },
  );
  await t.test(
    "all admin list, analytics and settings endpoints use real data",
    async () => {
      for (const path of [
        "users",
        "users/" + playerId,
        "transactions",
        "sessions",
        "payments",
        "analytics",
        "audit-logs",
        "game-pricing",
        "settings",
      ]) {
        const r = await admin.get(`/api/admin/${path}`);
        assert.equal(r.status, 200, path + JSON.stringify(r.body));
      }
      assert.equal(
        (
          await edit(
            "/settings",
            { supportEmail: "support@lexihive", supportReplyAim: false },
            "patch",
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await edit(
            "/settings",
            { supportEmail: "support@example.com", supportReplyAim: false },
            "patch",
          )
        ).status,
        200,
      );
      assert.equal(
        (await player.get("/api/site")).body.supportEmail,
        "support@example.com",
      );
    },
  );
  await t.test(
    "verified revenue caps overlapping reversals per order and stays separate from game coins",
    async () => {
      const orders = [];
      for (const reference of ["9001", "9002"]) {
        const quote = await db.coinQuote.create({
          data: {
            userId: playerId,
            cents: 1000,
            coins: 1000,
            currency: "eur",
            pricingVersion: 1,
            expiresAt: new Date(Date.now() + 60000),
          },
        });
        const p = await db.payment.create({
          data: {
            userId: playerId,
            provider: "transactworld",
            quoteId: quote.id,
            cents: 1000,
            coins: 1000,
            currency: "eur",
            checkoutId: randomUUID().replaceAll("-", "").repeat(2),
            intentId: reference,
          },
        });
        const response = {
          paymentId: reference,
          merchantTransactionId: p.checkoutId!,
          amount: "10.00",
          currency: "EUR",
          status: "capturesuccess",
          transactionStatus: "Y",
        };
        await reconcileTransactworld(p, async () => response);
        orders.push({ p, response });
      }
      await reconcileTransactworld(orders[0].p, async () => ({
        ...orders[0].response,
        status: "refundsuccess",
        refundamount: "10.00",
        chargebackamount: "10.00",
      }));
      const totals = await verifiedRevenueTotals();
      assert.equal(totals.find((r: any) => r.currency === "eur").cents, 1000);
      assert.equal(
        totals.find((r: any) => r.currency === "eur").grossCents,
        2000,
      );
      const overview = await admin.get("/api/admin/overview");
      assert.equal(overview.status, 200);
      assert.equal(
        overview.body.revenueByCurrency.find((r: any) => r.currency === "eur")
          .cents,
        1000,
      );
    },
  );
  await t.test(
    "suspension invalidates access and the last administrator cannot be removed",
    async () => {
      const r = await edit(
        `/users/${poorId}`,
        {
          status: "SUSPENDED",
          reason: "Integration suspension check",
          password,
        },
        "patch",
      );
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal((await poor.get("/api/wallet")).status, 401);
      assert.equal(
        (
          await post(poor, "", "/auth/login", {
            email: "billing-poor@example.com",
            password,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await edit(
            `/users/${adminId}`,
            { role: "USER", reason: "Last administrator protection", password },
            "patch",
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "account closure refunds unstarted billing and retains its financial trace",
    async () => {
      const closing = request.agent(app);
      const registration = await post(closing, "", "/auth/register", {
        displayName: "Closing player",
        email: "closing@example.com",
        password,
        confirmPassword: password,
        terms: true,
      });
      assert.equal(registration.status, 201);
      const id = registration.body.user.id,
        csrf = registration.body.csrf;
      await db.user.update({ where: { id }, data: { verifiedAt: new Date() } });
      await atomic((tx) =>
        ledger(
          tx,
          id,
          100,
          "admin",
          "fixture:closure",
          "Isolated account closure funding",
        ),
      );
      const s = await start("code-breaker", "full", closing, csrf);
      assert.equal(
        (
          await post(
            closing,
            csrf,
            `/games/code-breaker/sessions/${s.id}/authorize`,
            { confirmedPrice: 100, pricingVersion: s.pricingVersion },
          )
        ).status,
        200,
      );
      const deleted = await closing
        .delete("/api/me")
        .set("Origin", process.env.APP_ORIGIN!)
        .set("X-CSRF-Token", csrf)
        .send({ password });
      assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
      assert.equal(
        (await db.gameSession.findUniqueOrThrow({ where: { id: s.id } }))
          .billingState,
        "REFUNDED",
      );
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId: id } })).balance,
        100,
      );
      assert.equal(
        await db.walletTransaction.count({
          where: { reference: `game-session:${s.id}` },
        }),
        1,
      );
      assert.equal(
        await db.walletTransaction.count({
          where: { reference: `game-session-refund:${s.id}` },
        }),
        1,
      );
    },
  );
});

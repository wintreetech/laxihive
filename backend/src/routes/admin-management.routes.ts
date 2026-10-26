import { Router } from "express";
import { z } from "zod";
import { db, atomic, assert } from "../config/database.js";
import { ledger } from "../services/wallet.service.js";
import { verifyPassword } from "../middleware/auth.middleware.js";
import {
  accessSchema,
  accessFor,
  accessId,
} from "../services/game-access.service.js";
import { accessProposals } from "../../shared/access.js";
import { games, expansionSlugs } from "../../shared/catalog.js";
import { timeLimit } from "../../shared/engine.js";
import { verifiedRevenueTotals } from "../services/reporting.service.js";
import {
  gatewayConfig,
  gatewaySetupIssues,
  reconcileTransactworld,
} from "../services/transactworld.service.js";
export const management = Router();
function page(query: any) {
  const input = z
    .object({
      page: z.coerce.number().int().min(1).max(100000).default(1),
      search: z.string().max(100).default(""),
      status: z.string().max(32).default(""),
    })
    .parse(query);
  return { ...input, take: 25, skip: (input.page - 1) * 25 };
}
management.get("/users", async (req, res) => {
  const p = page(req.query),
    where: any = {
      ...(p.search
        ? {
            OR: [
              { email: { contains: p.search, mode: "insensitive" } },
              { displayName: { contains: p.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(["ACTIVE", "SUSPENDED"].includes(p.status)
        ? { status: p.status }
        : {}),
      ...(req.query.role === "ADMIN" ? { role: "ADMIN" } : {}),
    };
  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        displayName: true,
        email: true,
        role: true,
        status: true,
        verifiedAt: true,
        createdAt: true,
        wallet: true,
      },
      orderBy: { createdAt: "desc" },
      take: p.take,
      skip: p.skip,
    }),
    db.user.count({ where }),
  ]);
  res.json({ items, total, page: p.page });
});
management.get("/users/:id", async (req, res) => {
  const id = String(req.params.id);
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      status: true,
      verifiedAt: true,
      createdAt: true,
      profile: true,
      wallet: true,
      achievements: { include: { achievement: true } },
      entitlements: { include: { unlock: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 25 },
      gameSessions: {
        include: { score: true },
        orderBy: { startedAt: "desc" },
        take: 25,
      },
    },
  });
  assert(user, 404, "User not found.");
  const transactions = await db.walletTransaction.findMany({
    where: { walletId: user.wallet?.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ ...user, transactions });
});
management.patch("/users/:id", async (req, res) => {
  const data = z
    .object({
      status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
      role: z.enum(["USER", "ADMIN"]).optional(),
      reason: z.string().trim().min(10).max(200),
      password: z.string().max(128),
    })
    .strict()
    .parse(req.body);
  const actor = await db.user.findUniqueOrThrow({
    where: { id: req.auth!.userId },
  });
  assert(
    await verifyPassword(data.password, actor.passwordHash),
    403,
    "Confirm your administrator password.",
  );
  await atomic(async (tx) => {
    // Serialize role/status changes so concurrent requests cannot remove the last active admin.
    await tx.siteSettings.upsert({
      where: { id: "global" },
      update: { revision: { increment: 1 } },
      create: { id: "global", revision: 1 },
    });
    const before = await tx.user.findUnique({
      where: { id: String(req.params.id) },
    });
    assert(before, 404, "User not found.");
    if (data.role === "ADMIN" && before.role !== "ADMIN")
      assert(
        before.verifiedAt &&
          before.passwordHash !== "deleted" &&
          (data.status || before.status) === "ACTIVE",
        409,
        "Verify and activate the account before granting administrator access.",
      );
    const removing =
      before.role === "ADMIN" &&
      before.status === "ACTIVE" &&
      (data.role === "USER" || data.status === "SUSPENDED");
    if (removing)
      assert(
        (await tx.user.count({ where: { role: "ADMIN", status: "ACTIVE" } })) >
          1,
        409,
        "Keep at least one active administrator.",
      );
    await tx.user.update({
      where: { id: before.id },
      data: { status: data.status, role: data.role },
    });
    if (data.status === "SUSPENDED" || (data.role && data.role !== before.role))
      await tx.session.deleteMany({ where: { userId: before.id } });
    await tx.adminAuditLog.create({
      data: {
        actorId: actor.id,
        action: "user.permissions",
        detail: {
          userId: before.id,
          before: { role: before.role, status: before.status },
          after: { role: data.role, status: data.status },
          reason: data.reason,
        },
      },
    });
  });
  res.json({ message: "User updated and recorded in the audit log." });
});
management.post("/wallet-adjustment", async (req, res) => {
  const data = z
    .object({
      userId: z.string().max(64),
      amount: z.number().int().min(-100000).max(100000).optional(),
      targetBalance: z.number().int().min(0).max(100000).optional(),
      expectedBalance: z.number().int().nonnegative().optional(),
      expectedDebt: z.number().int().nonnegative().optional(),
      reason: z.string().trim().min(10).max(200),
      requestId: z.uuid(),
      password: z.string().max(128).optional(),
    })
    .strict()
    .refine(
      (x) => (x.amount !== undefined) !== (x.targetBalance !== undefined),
      "Choose an amount or target balance.",
    )
    .parse(req.body);
  const actor = await db.user.findUniqueOrThrow({
    where: { id: req.auth!.userId },
  });
  const result = await atomic(async (tx) => {
    const w = await tx.wallet.findUnique({ where: { userId: data.userId } });
    assert(w, 404, "Wallet not found.");
    const reference = `admin:${data.requestId}`,
      old = await tx.walletTransaction.findUnique({ where: { reference } });
    if (old) {
      assert(
        old.walletId === w.id &&
          old.description === data.reason &&
          (data.amount !== undefined
            ? old.amount === data.amount
            : old.balanceAfter === data.targetBalance),
        409,
        "This request ID was already used for a different adjustment.",
      );
      return w;
    }
    if (data.targetBalance !== undefined)
      assert(
        data.expectedBalance === w.balance &&
          data.expectedDebt === w.debt &&
          w.debt === 0,
        409,
        "Wallet changed or has debt. Refresh the preview; settle debt with a credit before setting a balance.",
      );
    const amount = data.amount ?? data.targetBalance! - w.balance;
    assert(amount !== 0, 400, "The adjustment must change the balance.");
    if (Math.abs(amount) >= 10000)
      assert(
        data.password &&
          (await verifyPassword(data.password, actor.passwordHash)),
        403,
        "Confirm your administrator password for changes of 10,000 coins or more.",
      );
    await ledger(tx, data.userId, amount, "admin", reference, data.reason);
    await tx.adminAuditLog.create({
      data: {
        actorId: actor.id,
        action: "wallet.adjust",
        detail: {
          userId: data.userId,
          amount,
          targetBalance: data.targetBalance ?? null,
          reason: data.reason,
          requestId: data.requestId,
        },
      },
    });
    return tx.wallet.findUniqueOrThrow({ where: { id: w.id } });
  });
  res.json({ message: "Adjustment recorded.", wallet: result });
});
management.get("/game-pricing", async (_req, res) => {
  res.json(
    await Promise.all(
      games.map(async (g) => ({
        ...g,
        modes: await Promise.all(
          [
            "starter",
            ...(expansionSlugs.includes(g.slug) ? ["advanced"] : []),
          ].map(async (mode) => {
            const config = await db.gameAccessConfig.findUnique({
              where: { id: accessId(g.slug, mode) },
            });
            return {
              mode,
              live: await accessFor(db, g.slug, mode),
              draft: config
                ? config.draft
                : mode === "starter"
                  ? {
                      ...accessProposals[g.slug],
                      trialSeconds: 30,
                      sessionSeconds: timeLimit(g.slug),
                      active: true,
                    }
                  : null,
            };
          }),
        ),
        proposalReason: accessProposals[g.slug].reason,
      })),
    ),
  );
});
management.put("/game-pricing/:slug/:mode", async (req, res) => {
  const slug = String(req.params.slug),
    mode = String(req.params.mode);
  assert(
    games.some((g) => g.slug === slug) &&
      ["starter", "advanced"].includes(mode) &&
      (mode !== "advanced" || expansionSlugs.includes(slug)),
    404,
    "Game mode not found.",
  );
  const data = z
    .object({
      config: accessSchema,
      publish: z.boolean(),
      expectedVersion: z.number().int().nonnegative(),
      reason: z.string().trim().min(10).max(200),
    })
    .strict()
    .parse(req.body);
  assert(
    data.config.sessionSeconds <= timeLimit(slug),
    400,
    "Session duration exceeds this game's supported timer.",
  );
  assert(
    data.config.accessType !== "PERMANENT_UNLOCK" || mode === "advanced",
    400,
    "Permanent access uses the existing advanced expansion.",
  );
  assert(
    mode !== "advanced" ||
      data.config.accessType !== "PERMANENT_UNLOCK" ||
      data.config.coinPrice > 0,
    400,
    "Set an expansion price.",
  );
  const result = await atomic(async (tx) => {
    const before = await accessFor(tx, slug, mode);
    assert(
      before.version === data.expectedVersion,
      409,
      "Another administrator changed this mode. Refresh before publishing.",
    );
    const base = {
      gameSlug: slug,
      mode,
      accessType: before.accessType,
      coinPrice: before.coinPrice,
      trialSeconds: before.trialSeconds,
      sessionSeconds: before.sessionSeconds,
      active: before.active,
      version: before.version,
    };
    const changes = data.publish
      ? {
          ...data.config,
          version: before.version + 1,
          publishedAt: new Date(),
          draft: null as any,
        }
      : { draft: data.config };
    const updated = await tx.gameAccessConfig.upsert({
      where: { id: accessId(slug, mode) },
      create: { id: accessId(slug, mode), ...base, ...changes },
      update: changes,
    });
    if (
      data.publish &&
      mode === "advanced" &&
      data.config.accessType === "PERMANENT_UNLOCK"
    )
      await tx.gameUnlock.update({
        where: { gameSlug: slug },
        data: { price: data.config.coinPrice, active: data.config.active },
      });
    await tx.adminAuditLog.create({
      data: {
        actorId: req.auth!.userId,
        action: data.publish ? "game.pricing.publish" : "game.pricing.draft",
        detail: {
          slug,
          mode,
          before,
          config: data.config,
          reason: data.reason,
        } as any,
      },
    });
    return updated;
  });
  res.json(result);
});
management.get("/transactions", async (req, res) => {
  const p = page(req.query),
    where: any = {
      ...(p.status ? { kind: p.status } : {}),
      ...(p.search
        ? {
            OR: [
              { description: { contains: p.search, mode: "insensitive" } },
              { reference: { contains: p.search } },
            ],
          }
        : {}),
    };
  const [items, total] = await Promise.all([
    db.walletTransaction.findMany({
      where,
      include: { wallet: { select: { userId: true } } },
      orderBy: { createdAt: "desc" },
      take: p.take,
      skip: p.skip,
    }),
    db.walletTransaction.count({ where }),
  ]);
  res.json({ items, total, page: p.page });
});
management.get("/sessions", async (req, res) => {
  const p = page(req.query),
    where = {
      ...(p.status ? { billingState: p.status } : {}),
      ...(p.search ? { gameSlug: { contains: p.search } } : {}),
    };
  const [items, total] = await Promise.all([
    db.gameSession.findMany({
      where,
      select: {
        id: true,
        userId: true,
        gameSlug: true,
        difficulty: true,
        accessType: true,
        billingState: true,
        coinPrice: true,
        pricingVersion: true,
        trialSeconds: true,
        startedAt: true,
        readyAt: true,
        completedAt: true,
        authorizedAt: true,
        expiresAt: true,
        outcome: true,
        duration: true,
      },
      orderBy: { startedAt: "desc" },
      take: p.take,
      skip: p.skip,
    }),
    db.gameSession.count({ where }),
  ]);
  res.json({ items, total, page: p.page });
});
management.get("/payments", async (req, res) => {
  const p = page(req.query),
    where: any = {
      ...(p.status ? { status: p.status } : {}),
      ...(p.search
        ? {
            OR: [
              { id: { contains: p.search } },
              { checkoutId: { contains: p.search } },
              { intentId: { contains: p.search } },
              { user: { email: { contains: p.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
  const [items, total] = await Promise.all([
    db.payment.findMany({
      where,
      include: {
        user: { select: { email: true, displayName: true } },
        notifications: {
          select: { signedFields: true, createdAt: true, processedAt: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
      orderBy: { createdAt: "desc" },
      take: p.take,
      skip: p.skip,
    }),
    db.payment.count({ where }),
  ]);
  res.json({
    items,
    total,
    page: p.page,
    inquiryConfigured: !!gatewayConfig().authToken,
  });
});
management.post("/payments/:id/reconcile", async (req, res) => {
  const payment = await db.payment.findUnique({
    where: { id: String(req.params.id) },
  });
  assert(payment, 404, "Payment not found.");
  await db.adminAuditLog.create({
    data: {
      actorId: req.auth!.userId,
      action: "payment.reconcile.request",
      detail: { paymentId: payment.id },
    },
  });
  const result = await reconcileTransactworld(payment);
  res.json({ status: result.status });
});
management.get("/audit-logs", async (req, res) => {
  const p = page(req.query),
    where = p.search ? { action: { contains: p.search } } : {};
  const [items, total] = await Promise.all([
    db.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: p.take,
      skip: p.skip,
    }),
    db.adminAuditLog.count({ where }),
  ]);
  res.json({ items, total, page: p.page });
});
management.get("/analytics", async (_req, res) => {
  const [
    coinKinds,
    sessionStates,
    trialStarted,
    trialConverted,
    paidSessions,
    popularPaid,
    revenue,
    payingUsers,
    amounts,
    wallet,
    categoryUse,
  ] = await Promise.all([
    db.walletTransaction.groupBy({
      by: ["kind"],
      _sum: { amount: true },
      _count: true,
    }),
    db.gameSession.groupBy({
      by: ["billingState"],
      _count: true,
      _avg: { duration: true },
    }),
    db.gameSession.count({ where: { trialStartedAt: { not: null } } }),
    db.gameSession.count({
      where: { trialStartedAt: { not: null }, authorizedAt: { not: null } },
    }),
    db.gameSession.count({ where: { authorizedAt: { not: null } } }),
    db.gameSession.groupBy({
      by: ["gameSlug"],
      where: { authorizedAt: { not: null }, billingState: { not: "REFUNDED" } },
      _sum: { coinPrice: true },
      _count: true,
      orderBy: { _sum: { coinPrice: "desc" } },
    }),
    db.payment.groupBy({
      by: ["currency"],
      where: { credited: true },
      _sum: { cents: true, refundedCents: true, disputeCents: true },
      _avg: { cents: true },
      _count: true,
    }),
    db.payment.groupBy({
      by: ["userId"],
      where: { credited: true },
      _count: true,
    }),
    db.payment.groupBy({
      by: ["currency", "cents"],
      where: { credited: true },
      _count: true,
    }),
    db.wallet.aggregate({ _sum: { balance: true, debt: true } }),
    db.gameSession.groupBy({ by: ["gameSlug"], _count: true }),
  ]);
  const [completedPreviews, recordedDuration, paymentStates, netRevenue] =
    await Promise.all([
      db.gameSession.count({
        where: {
          trialStartedAt: { not: null },
          authorizedAt: null,
          outcome: { in: ["won", "lost"] },
        },
      }),
      db.gameSession.aggregate({
        where: { outcome: { in: ["won", "lost"] }, completedAt: { not: null } },
        _avg: { duration: true },
      }),
      db.payment.groupBy({ by: ["status"], _count: true }),
      verifiedRevenueTotals(),
    ]);
  const spending = await db.$runCommandRaw({
    aggregate: "WalletTransaction",
    pipeline: [
      {
        $match: {
          kind: {
            $in: ["spent", "game_session_charge", "game_session_refund"],
          },
        },
      },
      {
        $lookup: {
          from: "Wallet",
          localField: "walletId",
          foreignField: "_id",
          as: "wallet",
        },
      },
      { $unwind: "$wallet" },
      {
        $group: {
          _id: "$wallet.userId",
          coins: { $sum: { $multiply: ["$amount", -1] } },
        },
      },
    ],
    cursor: {},
  });
  const buyerIds = new Set(payingUsers.map((p) => p.userId));
  const averageCoinsPerPayingUser = payingUsers.length
    ? ((spending as any).cursor?.firstBatch ?? [])
        .filter((r: any) => buyerIds.has(r._id))
        .reduce((sum: number, r: any) => sum + r.coins, 0) / payingUsers.length
    : 0;
  const series = await db.$runCommandRaw({
    aggregate: "WalletTransaction",
    pipeline: [
      {
        $match: {
          createdAt: {
            $gte: { $date: new Date(Date.now() - 30 * 86400000).toISOString() },
          },
        },
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            kind: "$kind",
          },
          coins: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.day": 1 } },
    ],
    cursor: {},
  });
  const revenueSeries = await db.$runCommandRaw({
    aggregate: "Payment",
    pipeline: [
      { $match: { credited: true } },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            currency: "$currency",
          },
          cents: {
            $sum: {
              $subtract: [
                "$cents",
                {
                  $min: [
                    "$cents",
                    { $add: ["$refundedCents", "$disputeCents"] },
                  ],
                },
              ],
            },
          },
        },
      },
      { $sort: { "_id.day": -1 } },
      { $limit: 90 },
    ],
    cursor: {},
  });
  res.json({
    coinKinds,
    sessionStates,
    trialStarted,
    trialConverted,
    completedPreviews,
    recordedAverageDuration: recordedDuration._avg.duration,
    paymentStates,
    netRevenue,
    averageCoinsPerPayingUser,
    conversionPercent: trialStarted ? (100 * trialConverted) / trialStarted : 0,
    paidSessions,
    popularPaid,
    revenue,
    payingUsers: payingUsers.length,
    amounts,
    wallet: wallet._sum,
    categoryUse: categoryUse.map((x) => ({
      category: games.find((g) => g.slug === x.gameSlug)?.category,
      ...x,
    })),
    coinSeries: (series as any).cursor?.firstBatch ?? [],
    revenueSeries: (revenueSeries as any).cursor?.firstBatch ?? [],
    note: "Game coin spending is usage, not money revenue. Net payment revenue deducts known refunds/chargebacks, capped at the order amount; excludes fees/taxes. Category profit is unavailable without cost attribution.",
  });
});
export const supportEmailSchema = z.union([
  z.literal(""),
  z.email().regex(/@[^@]+\.[^@]+$/, "Supply a complete email domain."),
]);
management.get("/settings", async (_req, res) =>
  res.json({
    settings: await db.siteSettings.findUnique({ where: { id: "global" } }),
    environmentSupportEmail: process.env.SUPPORT_EMAIL || "",
    paymentIssues: gatewaySetupIssues(),
    inquiryConfigured: !!gatewayConfig().authToken,
    smtpConfigured: !!process.env.SMTP_HOST,
    reconciliationEnabled:
      process.env.PAYMENT_RECONCILIATION_ENABLED !== "false",
  }),
);
management.patch("/settings", async (req, res) => {
  const data = z
    .object({ supportEmail: supportEmailSchema, supportReplyAim: z.boolean() })
    .strict()
    .parse(req.body);
  await atomic(async (tx) => {
    const before = await tx.siteSettings.findUnique({
      where: { id: "global" },
    });
    await tx.siteSettings.upsert({
      where: { id: "global" },
      update: data,
      create: { id: "global", ...data },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: req.auth!.userId,
        action: "site.settings",
        detail: { before, after: data } as any,
      },
    });
  });
  res.json({ message: "Settings saved." });
});

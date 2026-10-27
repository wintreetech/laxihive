import { Router } from "express";
import { z } from "zod";
import { db, atomic, assert } from "../config/database.js";
import { management } from "./admin-management.routes.js";
import { verifiedRevenueTotals } from "../services/reporting.service.js";
export const admin = Router();
admin.use(management);
admin.get("/overview", async (_req, res) => {
  const [
    users,
    activeUsers,
    sessions,
    completed,
    purchases,
    revenue,
    liability,
    popular,
    transactions,
    failed,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({
      where: {
        gameSessions: {
          some: { startedAt: { gte: new Date(Date.now() - 7 * 86400000) } },
        },
      },
    }),
    db.gameSession.count(),
    db.gameSession.count({ where: { completedAt: { not: null } } }),
    db.purchase.count(),
    verifiedRevenueTotals(),
    db.wallet.aggregate({ _sum: { balance: true, debt: true } }),
    db.gameSession.groupBy({
      by: ["gameSlug"],
      _count: true,
      orderBy: { _count: { gameSlug: "desc" } },
      take: 5,
    }),
    db.walletTransaction.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    db.payment.count({ where: { status: { in: ["failed", "disputed"] } } }),
  ]);
  const [newUsers, pendingPayments, gamesAvailable, coinKinds, sessionStates] =
    await Promise.all([
      db.user.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
      }),
      db.payment.count({ where: { status: { in: ["pending", "abandoned"] } } }),
      db.game.count({ where: { visible: true } }),
      db.walletTransaction.groupBy({ by: ["kind"], _sum: { amount: true } }),
      db.gameSession.groupBy({ by: ["billingState"], _count: true }),
    ]);
  res.json({
    newUsers,
    pendingPayments,
    gamesAvailable,
    coinKinds,
    sessionStates,
    users,
    activeUsers,
    sessions,
    completed,
    purchases,
    revenueByCurrency: revenue,
    liability: liability._sum,
    popular,
    transactions,
    failed,
  });
});
admin.get("/games", async (_req, res) =>
  res.json(await db.game.findMany({ include: { unlock: true } })),
);
export const pricingSchema = z
  .object({
    minCents: z.number().int().min(500).max(50000),
    maxCents: z.number().int().min(500).max(50000),
    stepCents: z.number().int().min(100).max(5000).multipleOf(100),
    coinsPerDollar: z.number().int().min(1).max(10000),
    coinsPerEuro: z.number().int().min(1).max(10000).optional(),
    enabled: z.boolean(),
    pricingPolicy: z.enum(["INDEPENDENT", "FX_BASED"]).optional(),
  })
  .refine(
    (p) =>
      p.maxCents >= p.minCents &&
      (p.maxCents - p.minCents) % p.stepCents === 0 &&
      (p.minCents * p.coinsPerDollar) % 100 === 0,
    "Limits must align with steps and produce whole coins.",
  );
admin.patch("/coin-pricing", async (req, res) => {
  const data = pricingSchema.parse(req.body);
  const result = await atomic(async (tx) => {
    const before = await tx.coinPricingConfig.findUniqueOrThrow({
      where: { id: "global" },
    });
    const config = await tx.coinPricingConfig.update({
      where: { id: "global" },
      data: { ...data, version: { increment: 1 } },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: req.auth!.userId,
        action: "pricing.update",
        detail: { before, after: config } as any,
      },
    });
    return config;
  });
  res.json(result);
});
admin.patch("/games/:slug", async (req, res) => {
  const data = z
    .object({
      visible: z.boolean().optional(),
      price: z.number().int().min(1).max(100000).optional(),
      expansionActive: z.boolean().optional(),
    })
    .parse(req.body);
  await atomic(async (tx) => {
    const before = await tx.game.findUniqueOrThrow({
      where: { slug: req.params.slug as string },
      include: { unlock: true },
    });
    if (data.visible !== undefined)
      await tx.game.update({
        where: { slug: before.slug },
        data: { visible: data.visible },
      });
    if (data.price !== undefined || data.expansionActive !== undefined) {
      assert(before.unlock, 400, "This game has no expansion.");
      await tx.gameUnlock.update({
        where: { id: before.unlock.id },
        data: { price: data.price, active: data.expansionActive },
      });
      await tx.gameAccessConfig.updateMany({
        where: {
          gameSlug: before.slug,
          mode: "advanced",
          accessType: "PERMANENT_UNLOCK",
        },
        data: {
          coinPrice: data.price,
          active: data.expansionActive,
          version: { increment: 1 },
        },
      });
    }
    await tx.adminAuditLog.create({
      data: {
        actorId: req.auth!.userId,
        action: "game.update",
        detail: { slug: before.slug, before, changes: data } as any,
      },
    });
  });
  res.json({ ok: true });
});

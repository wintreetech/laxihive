import { Router } from "express";
import { z } from "zod";
import { db, atomic, assert } from "../config/database.js";
import { publicUser, passwordSchema } from "./auth.routes.js";
import { ledger } from "../services/wallet.service.js";
import {
  hashPassword,
  verifyPassword,
  cookieName,
  cookieOptions,
} from "../middleware/auth.middleware.js";
export const me = Router();
me.get("/", async (req, res) =>
  res.json(
    publicUser(
      await db.user.findUniqueOrThrow({
        where: { id: req.auth!.userId },
        include: { profile: true, wallet: true },
      }),
    ),
  ),
);
me.patch("/", async (req, res) => {
  const data = z
    .object({
      displayName: z.string().trim().min(2).max(32),
      avatar: z.enum(["violet", "cyan", "green", "amber"]),
      isPublic: z.boolean(),
    })
    .parse(req.body);
  await db.user.update({
    where: { id: req.auth!.userId },
    data: {
      displayName: data.displayName,
      profile: { update: { avatar: data.avatar, isPublic: data.isPublic } },
    },
  });
  res.json({ message: "Profile updated." });
});
me.get("/progress", async (req, res) =>
  res.json(
    await db.userGameProgress.findMany({ where: { userId: req.auth!.userId } }),
  ),
);
me.get("/achievements", async (req, res) =>
  res.json(
    await db.userAchievement.findMany({
      where: { userId: req.auth!.userId },
      include: { achievement: true },
      orderBy: { earnedAt: "desc" },
    }),
  ),
);
me.get("/dashboard", async (req, res) => {
  const userId = req.auth!.userId;
  const [user, progress, history, achievements, sessions, total] =
    await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: userId },
        include: { profile: true, wallet: true },
      }),
      db.userGameProgress.findMany({
        where: { userId },
        orderBy: { lastPlayedAt: "desc" },
      }),
      db.gameSession.findMany({
        where: { userId, completedAt: { not: null } },
        include: { score: true },
        orderBy: { completedAt: "desc" },
        take: 30,
      }),
      db.userAchievement.findMany({
        where: { userId },
        include: { achievement: true },
      }),
      db.gameSession.count({ where: { userId } }),
      db.gameSession.count({ where: { userId, completedAt: { not: null } } }),
    ]);
  const week = await db.gameSession.findMany({
    where: {
      userId,
      completedAt: { gte: new Date(Date.now() - 7 * 86400000) },
    },
    select: {
      completedAt: true,
      duration: true,
      score: { select: { xp: true } },
    },
  });
  res.json({
    user: publicUser(user),
    progress,
    history,
    achievements,
    sessions,
    total,
    week,
  });
});
me.get("/sessions", async (req, res) =>
  res.json(
    await db.session.findMany({
      where: { userId: req.auth!.userId, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true },
    }),
  ),
);
me.delete("/sessions/:id", async (req, res) => {
  await db.session.deleteMany({
    where: { userId: req.auth!.userId, id: req.params.id as string },
  });
  res.json({ ok: true });
});
me.post("/change-password", async (req, res) => {
  const data = z
    .object({ currentPassword: z.string().max(128), password: passwordSchema })
    .parse(req.body);
  const user = await db.user.findUniqueOrThrow({
    where: { id: req.auth!.userId },
  });
  assert(
    await verifyPassword(data.currentPassword, user.passwordHash),
    400,
    "The current password is incorrect.",
  );
  await atomic(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(data.password) },
    });
    await tx.session.deleteMany({
      where: { userId: user.id, id: { not: req.auth!.id } },
    });
  });
  res.json({
    message: "Password updated. Other sessions have been signed out.",
  });
});
me.post("/import-progress", async (req, res) => {
  const { records } = z
    .object({
      records: z
        .array(
          z.object({
            slug: z.string().max(64),
            seed: z.number().int().min(1).max(2147483647),
            level: z.number().int().min(1).max(10).optional(),
            actions: z
              .array(
                z.object({
                  type: z.enum(["select", "submit", "clear", "timeout"]),
                  value: z
                    .union([
                      z.string().max(40),
                      z.number().int().min(0).max(100),
                    ])
                    .optional(),
                }),
              )
              .max(2000),
          }),
        )
        .max(100),
    })
    .parse(req.body);
  const { replay, campaignSeed } = await import("../../shared/engine.js");
  const { games } = await import("../../shared/catalog.js");
  let count = 0;
  await atomic(async (tx) => {
    for (const record of records) {
      if (!games.some((g) => g.slug === record.slug)) continue;
      const result = replay(
        record.slug,
        record.seed,
        "starter",
        record.actions,
      );
      if (result.status !== "won") continue;
      const old = await tx.userGameProgress.findUnique({
        where: {
          userId_gameSlug: { userId: req.auth!.userId, gameSlug: record.slug },
        },
      });
      const campaign = (old?.campaign ?? {}) as Record<string, number>;
      if (
        record.slug === "hive-quest" &&
        record.level &&
        record.seed === campaignSeed(record.level)
      ) {
        const key = `starter:${record.level}`;
        const stars = result.mistakes === 0 ? 3 : result.mistakes < 3 ? 2 : 1;
        campaign[key] = Math.max(campaign[key] ?? 0, stars);
      }
      const stars = Object.values(campaign).reduce(
        (sum, value) => sum + value,
        0,
      );
      await tx.userGameProgress.upsert({
        where: {
          userId_gameSlug: { userId: req.auth!.userId, gameSlug: record.slug },
        },
        create: {
          userId: req.auth!.userId,
          gameSlug: record.slug,
          bestScore: result.score,
          campaign,
          stars,
        },
        update: {
          bestScore: Math.max(old?.bestScore ?? 0, result.score),
          campaign,
          stars,
        },
      });
      count++;
    }
  });
  res.json({
    message: `Imported ${count} personal records. Imports do not award XP, coins or leaderboard entries.`,
  });
});
me.delete("/", async (req, res) => {
  const { password } = z
    .object({ password: z.string().max(128) })
    .parse(req.body);
  const userId = req.auth!.userId;
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  assert(
    user.role !== "ADMIN",
    409,
    "Transfer administrator responsibility before deleting this account.",
  );
  assert(
    await verifyPassword(password, user.passwordHash),
    400,
    "The password is incorrect.",
  );
  await atomic(async (tx) => {
    await tx.siteSettings.upsert({
      where: { id: "global" },
      update: { revision: { increment: 1 } },
      create: { id: "global", revision: 1 },
    });
    const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    assert(
      current.role !== "ADMIN",
      409,
      "Transfer administrator responsibility before deleting this account.",
    );
    await tx.session.deleteMany({ where: { userId } });
    await tx.authToken.deleteMany({ where: { userId } });
    // Retain billed-session references as financial records after anonymization.
    const unstarted = await tx.gameSession.findMany({
      where: {
        userId,
        authorizedAt: { not: null },
        readyAt: null,
        billingState: "PAYMENT_AUTHORIZED",
      },
    });
    for (const session of unstarted) {
      await ledger(
        tx,
        userId,
        session.coinPrice,
        "game_session_refund",
        `game-session-refund:${session.id}`,
        "Unstarted session refunded on account closure",
      );
      await tx.gameSession.update({
        where: { id: session.id },
        data: { billingState: "REFUNDED", completedAt: new Date() },
      });
    }
    await tx.gameScore.deleteMany({ where: { session: { userId } } });
    await tx.gameSession.deleteMany({
      where: {
        userId,
        OR: [{ authorizedAt: null }, { authorizedAt: { isSet: false } }],
      },
    });
    await tx.gameSession.updateMany({
      where: { userId },
      data: { ranked: false },
    });
    await tx.userGameProgress.deleteMany({ where: { userId } });
    await tx.userAchievement.deleteMany({ where: { userId } });
    await tx.userEntitlement.deleteMany({ where: { userId } });
    await tx.userProfile.update({
      where: { userId },
      data: {
        isPublic: false,
        xp: 0,
        streak: 0,
        longestStreak: 0,
        playSeconds: 0,
        lastPlayDate: null,
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@invalid.local`,
        displayName: "Deleted player",
        passwordHash: "deleted",
        verifiedAt: null,
      },
    });
  });
  res.clearCookie(cookieName, cookieOptions());
  res.json({
    message:
      "Your account and gameplay data have been removed. Required payment and audit records are retained.",
  });
});

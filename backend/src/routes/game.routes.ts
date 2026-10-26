import { Router } from "express";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { db, atomic, assert } from "../config/database.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { games as catalog, achievements } from "../../shared/catalog.js";
import {
  replay,
  dailySeed,
  timeLimit,
  scoreFor,
  campaignSeed,
} from "../../shared/engine.js";
import {
  DAILY_REWARD_LIMIT,
  XP_PER_WIN,
  nextStreak,
} from "../../shared/rules.js";
import { ledger } from "../services/wallet.service.js";
import {
  accessFor,
  createAccessSession,
  readySession,
  authorizeSession,
  cancelSession,
  sessionView,
} from "../services/game-access.service.js";
export const gameRoutes = Router();
export const completionSchema = z.object({
  sessionId: z.string().max(64),
  actions: z
    .array(
      z.object({
        type: z.enum(["select", "submit", "clear", "timeout"]),
        value: z
          .union([z.string().max(40), z.number().int().min(0).max(100)])
          .optional(),
      }),
    )
    .max(2000),
});
gameRoutes.get("/", async (_req, res) => {
  const stored = await db.game.findMany();
  const pricing = await db.gameAccessConfig.findMany({
    where: { mode: "starter" },
  });
  res.json(
    catalog
      .filter((g) => stored.find((s) => s.slug === g.slug)?.visible)
      .map((g) => ({
        ...g,
        access: pricing.find((p) => p.gameSlug === g.slug) ?? {
          accessType: "FREE_FULL",
          coinPrice: 0,
          trialSeconds: 30,
          active: true,
          version: 0,
        },
      })),
  );
});
gameRoutes.get("/:slug", async (req, res) => {
  const g = await db.game.findUnique({
    where: { slug: req.params.slug as string },
    include: { unlock: true },
  });
  assert(g?.visible, 404, "Game not found.");
  const progress = req.auth
    ? await db.userGameProgress.findUnique({
        where: {
          userId_gameSlug: { userId: req.auth.userId, gameSlug: g.slug },
        },
      })
    : null;
  const owned = !!(
    req.auth &&
    g.unlock &&
    (await db.userEntitlement.findUnique({
      where: {
        userId_unlockId: { userId: req.auth.userId, unlockId: g.unlock.id },
      },
    }))
  );
  const mode = req.query.mode === "advanced" ? "advanced" : "starter";
  const access = await accessFor(db, g.slug, mode);
  res.json({
    ...catalog.find((c) => c.slug === g.slug),
    unlock: g.unlock,
    owned,
    access:
      mode === "advanced" && owned && access.accessType !== "FREE_FULL"
        ? { ...access, accessType: "PERMANENT_UNLOCK", coinPrice: 0 }
        : access,
    campaign: progress?.campaign ?? {},
  });
});
gameRoutes.post("/:slug/sessions", requireAuth, async (req, res) => {
  const slug = req.params.slug as string;
  if (req.body.requestId) {
    const input = z
      .object({
        difficulty: z.enum(["starter", "advanced"]).default("starter"),
        level: z.number().int().min(1).max(10).default(1),
        requestId: z.uuid(),
        intent: z.enum(["preview", "full"]).default("full"),
      })
      .strict()
      .parse(req.body);
    res
      .status(201)
      .json(await createAccessSession(req.auth!.userId, slug, input));
    return;
  }
  const { difficulty, level } = z
    .object({
      difficulty: z.enum(["starter", "advanced"]).default("starter"),
      level: z.number().int().min(1).max(10).default(1),
    })
    .parse(req.body);
  const access = await accessFor(db, slug, difficulty);
  assert(
    access.active &&
      ["FREE_FULL", "PERMANENT_UNLOCK"].includes(access.accessType),
    409,
    "Open the updated game page to review this session's price.",
  );
  const game = await db.game.findUnique({
    where: { slug },
    include: { unlock: true },
  });
  assert(game?.visible, 404, "Game not found.");
  if (difficulty === "advanced") {
    const unlock = game.unlock;
    assert(unlock?.active, 403, "Advanced mode is not available.");
    const entitlement = await db.userEntitlement.findUnique({
      where: {
        userId_unlockId: { userId: req.auth!.userId, unlockId: unlock.id },
      },
    });
    const wallet = await db.wallet.findUniqueOrThrow({
      where: { userId: req.auth!.userId },
    });
    assert(
      entitlement && wallet.debt === 0,
      403,
      "Unlock this expansion in the store first.",
    );
  }
  const active = await db.gameSession.count({
    where: {
      userId: req.auth!.userId,
      OR: [{ completedAt: null }, { completedAt: { isSet: false } }],
      startedAt: { gt: new Date(Date.now() - 600000) },
    },
  });
  assert(
    active < 10,
    429,
    "Finish or wait for an open game before starting another.",
  );
  if (slug === "hive-quest" && level > 1) {
    const progress = await db.userGameProgress.findUnique({
      where: { userId_gameSlug: { userId: req.auth!.userId, gameSlug: slug } },
    });
    const campaign = (progress?.campaign ?? {}) as Record<string, number>;
    assert(
      campaign[`${difficulty}:${level - 1}`] > 0,
      403,
      "Complete the preceding hive to unlock this level.",
    );
  }
  const seed =
    slug === "hive-quest"
      ? campaignSeed(level, difficulty)
      : ["daily-hive", "word-blitz"].includes(slug)
        ? dailySeed()
        : randomInt(1, 2147483647);
  if (slug === "daily-hive")
    await db.dailyChallenge.upsert({
      where: { date: new Date().toISOString().slice(0, 10) },
      update: {},
      create: {
        date: new Date().toISOString().slice(0, 10),
        seed,
        gameSlug: slug,
      },
    });
  const session = await db.gameSession.create({
    data: { userId: req.auth!.userId, gameSlug: slug, seed, difficulty, level },
  });
  res.status(201).json({
    id: session.id,
    seed,
    difficulty,
    level,
    startedAt: session.startedAt,
  });
});
gameRoutes.get("/:slug/sessions/:id", requireAuth, async (req, res) => {
  const s = await db.gameSession.findFirst({
    where: {
      id: String(req.params.id),
      userId: req.auth!.userId,
      gameSlug: String(req.params.slug),
    },
  });
  assert(s, 404, "Session not found.");
  res.json(sessionView(s));
});
for (const action of ["ready", "authorize", "cancel"] as const) {
  gameRoutes.post(
    `/:slug/sessions/:id/${action}`,
    requireAuth,
    async (req, res) => {
      const s = await db.gameSession.findFirst({
        where: {
          id: String(req.params.id),
          userId: req.auth!.userId,
          gameSlug: String(req.params.slug),
        },
      });
      assert(s, 404, "Session not found.");
      const result =
        action === "authorize"
          ? await authorizeSession(
              req.auth!.userId,
              s.id,
              z
                .object({
                  confirmedPrice: z.number().int().positive(),
                  pricingVersion: z.number().int().nonnegative(),
                })
                .strict()
                .parse(req.body),
              req.auth!.verified,
            )
          : action === "ready"
            ? await readySession(req.auth!.userId, s.id)
            : await cancelSession(req.auth!.userId, s.id);
      res.json(result);
    },
  );
}
gameRoutes.post("/:slug/complete", requireAuth, async (req, res) => {
  const data = completionSchema.parse(req.body),
    userId = req.auth!.userId,
    slug = req.params.slug as string;
  const result = await atomic(async (tx) => {
    const session = await tx.gameSession.findUnique({
      where: { id: data.sessionId },
    });
    assert(
      session && session.userId === userId && session.gameSlug === slug,
      404,
      "Game session not found.",
    );
    assert(!session.completedAt, 409, "This game has already been recorded.");
    const preview = session.billingState === "TRIAL_ACTIVE";
    assert(
      ["LEGACY", "ACTIVE", "TRIAL_ACTIVE"].includes(session.billingState),
      409,
      "This session is not authorized for gameplay.",
    );
    assert(
      !session.expiresAt ||
        session.expiresAt.getTime() + (preview ? 0 : 5000) >= Date.now(),
      409,
      "This session expired. Review the price before starting another attempt.",
    );
    assert(
      preview || session.coinPrice === 0 || !!session.authorizedAt,
      403,
      "Purchase this session before saving a result.",
    );
    const duration = Math.floor(
      (Date.now() - (session.readyAt ?? session.startedAt).getTime()) / 1000,
    );
    assert(
      duration >= 2 && duration <= timeLimit(slug) + 60,
      400,
      "This session is too short or has expired. Start a fresh game.",
    );
    const state = replay(slug, session.seed, session.difficulty, data.actions);
    assert(state.status !== "playing", 400, "Finish the game before saving.");
    if (slug === "word-blitz" && duration > 95)
      assert(state.status === "lost", 400, "The game clock has expired.");
    const won = state.status === "won",
      finalScore = scoreFor(state, duration);
    if (preview) {
      await tx.gameSession.update({
        where: { id: session.id },
        data: {
          completedAt: new Date(),
          billingState: "COMPLETED",
          ranked: false,
          duration,
          outcome: state.status,
          score: { create: { score: 0, xp: 0 } },
        },
      });
      return {
        score: 0,
        xp: 0,
        achievements: [],
        outcome: state.status,
        practice: true,
      };
    }
    const midnight = new Date(new Date().toISOString().slice(0, 10));
    const awarded = await tx.gameScore.count({
      where: {
        session: { userId, completedAt: { gte: midnight } },
        xp: { gt: 0 },
      },
    });
    const dailyDone =
      slug === "daily-hive"
        ? await tx.gameSession.count({
            where: {
              userId,
              gameSlug: slug,
              outcome: "won",
              completedAt: { gte: midnight },
              OR: [{ trialSeconds: 0 }, { authorizedAt: { not: null } }],
            },
          })
        : 0;
    const xp =
      won && awarded < DAILY_REWARD_LIMIT && !dailyDone ? XP_PER_WIN : 0;
    await tx.gameSession.update({
      where: { id: session.id },
      data: {
        completedAt: new Date(),
        billingState:
          session.billingState === "LEGACY" ? "LEGACY" : "COMPLETED",
        duration,
        outcome: state.status,
        score: { create: { score: won ? finalScore : 0, xp } },
      },
    });
    const newly: string[] = [];
    if (won) {
      const old = await tx.userGameProgress.findUnique({
        where: { userId_gameSlug: { userId, gameSlug: slug } },
      });
      const levelStars =
        slug === "hive-quest"
          ? state.mistakes === 0
            ? 3
            : state.mistakes < 3
              ? 2
              : 1
          : 0;
      const campaign = (old?.campaign ?? {}) as Record<string, number>;
      if (slug === "hive-quest")
        campaign[`${session.difficulty}:${session.level}`] = Math.max(
          campaign[`${session.difficulty}:${session.level}`] ?? 0,
          levelStars,
        );
      const stars = Object.values(campaign).reduce((sum, v) => sum + v, 0);
      await tx.userGameProgress.upsert({
        where: { userId_gameSlug: { userId, gameSlug: slug } },
        create: {
          userId,
          gameSlug: slug,
          bestScore: finalScore,
          wins: 1,
          stars,
          campaign,
          lastPlayedAt: new Date(),
        },
        update: {
          bestScore: Math.max(old?.bestScore ?? 0, finalScore),
          wins: { increment: 1 },
          stars,
          campaign,
          lastPlayedAt: new Date(),
        },
      });
      const profile = await tx.userProfile.findUniqueOrThrow({
          where: { userId },
        }),
        streak = nextStreak(profile.lastPlayDate, profile.streak);
      await tx.userProfile.update({
        where: { userId },
        data: {
          xp: { increment: xp },
          streak,
          longestStreak: Math.max(streak, profile.longestStreak),
          lastPlayDate: new Date(),
          playSeconds: { increment: duration },
        },
      });
      const progress = await tx.userGameProgress.findMany({
        where: { userId },
        include: { game: true },
      });
      const sum = (cats: string[]) =>
        progress
          .filter((p) => cats.includes(p.game.category))
          .reduce((a, p) => a + p.wins, 0);
      const conditions = [
        true,
        streak >= 5,
        sum(["Memory"]) >= 10,
        progress.filter((p) => p.wins > 0).length >= 10,
        sum(["Word"]) >= 20,
        sum(["Logic", "Puzzle"]) >= 10,
      ];
      for (let i = 0; i < achievements.length; i++)
        if (conditions[i]) {
          const a = achievements[i];
          const existing = await tx.userAchievement.findUnique({
            where: {
              userId_achievementSlug: { userId, achievementSlug: a.slug },
            },
          });
          if (!existing) {
            await tx.userAchievement.create({
              data: { userId, achievementSlug: a.slug },
            });
            await ledger(
              tx,
              userId,
              25,
              "earned",
              `achievement:${userId}:${a.slug}`,
              `${a.name} achievement`,
            );
            newly.push(a.slug);
          }
        }
    } else
      await tx.userProfile.update({
        where: { userId },
        data: { playSeconds: { increment: duration } },
      });
    return {
      score: won ? finalScore : 0,
      xp,
      achievements: newly,
      outcome: state.status,
    };
  });
  res.json(result);
});
export async function leaderboard(gameSlug?: string, weekly = false) {
  const scores = await db.gameScore.findMany({
    where: {
      session: {
        ranked: true,
        difficulty: "starter",
        outcome: "won",
        ...(gameSlug ? { gameSlug } : {}),
        ...(weekly
          ? { completedAt: { gte: new Date(Date.now() - 7 * 86400000) } }
          : {}),
        user: { profile: { isPublic: true } },
      },
    },
    include: {
      session: {
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              profile: { select: { avatar: true } },
            },
          },
        },
      },
    },
    orderBy: [{ score: "desc" }, { sessionId: "asc" }],
    take: 5000,
  });
  const best = new Map<string, any>();
  for (const row of scores) {
    const u = row.session.user;
    if (!best.has(u.id))
      best.set(u.id, {
        userId: u.id,
        displayName: u.displayName,
        avatar: u.profile?.avatar,
        score: row.score,
        gameSlug: row.session.gameSlug,
      });
  }
  return [...best.values()]
    .slice(0, 100)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
gameRoutes.get("/:slug/leaderboard", async (req, res) =>
  res.json(
    await leaderboard(req.params.slug as string, req.query.period === "weekly"),
  ),
);

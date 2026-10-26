import { createHash, randomInt } from "node:crypto";
import type { GameSession, Prisma } from "@prisma/client";
import { z } from "zod";
import { db, atomic, assert } from "../config/database.js";
import { ledger } from "./wallet.service.js";
import { accessTypes } from "../../shared/access.js";
import { campaignSeed, dailySeed, timeLimit } from "../../shared/engine.js";

export const accessSchema = z
  .object({
    accessType: z.enum(accessTypes),
    coinPrice: z.number().int().min(0).max(100000),
    trialSeconds: z.number().int().min(5).max(120),
    sessionSeconds: z.number().int().min(30).max(600),
    active: z.boolean(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if ((a.accessType === "FREE_FULL") !== (a.coinPrice === 0))
      ctx.addIssue({
        code: "custom",
        message:
          "Free games must cost zero; paid access must have a positive price.",
      });
    if (
      a.accessType === "FREE_TRIAL_THEN_PAID" &&
      a.trialSeconds >= a.sessionSeconds
    )
      ctx.addIssue({
        code: "custom",
        message: "A preview must be shorter than the full session.",
      });
  });
export const accessId = (slug: string, mode: string) => `${slug}:${mode}`;
export function sessionSeed(slug: string, mode: string, level: number) {
  return slug === "hive-quest"
    ? campaignSeed(level, mode)
    : ["daily-hive", "word-blitz"].includes(slug)
      ? dailySeed()
      : randomInt(1, 2147483647);
}
export async function accessFor(
  tx: Prisma.TransactionClient,
  slug: string,
  mode: string,
) {
  const found = await tx.gameAccessConfig.findUnique({
    where: { id: accessId(slug, mode) },
  });
  if (found) return found;
  const unlock =
    mode === "advanced"
      ? await tx.gameUnlock.findUnique({ where: { gameSlug: slug } })
      : null;
  return {
    accessType: mode === "advanced" ? "PERMANENT_UNLOCK" : "FREE_FULL",
    coinPrice: unlock?.price ?? 0,
    trialSeconds: 30,
    sessionSeconds: timeLimit(slug),
    active: mode === "starter" || !!unlock?.active,
    version: 0,
  };
}
export function sessionView(s: GameSession, now = new Date()) {
  const deadline =
    s.billingState === "TRIAL_ACTIVE" ? s.trialExpiresAt : s.expiresAt;
  const expired = deadline && deadline <= now;
  const billingState =
    expired &&
    ["ACTIVE", "TRIAL_ACTIVE", "PAYMENT_AUTHORIZED"].includes(s.billingState)
      ? s.billingState === "TRIAL_ACTIVE"
        ? "TRIAL_EXPIRED"
        : "EXPIRED"
      : s.billingState;
  const playable = ["ACTIVE", "TRIAL_ACTIVE", "LEGACY"].includes(billingState);
  return {
    id: s.id,
    gameSlug: s.gameSlug,
    difficulty: s.difficulty,
    level: s.level,
    seed: playable ? s.seed : undefined,
    billingState,
    accessType: s.accessType,
    coinPrice: s.coinPrice,
    pricingVersion: s.pricingVersion,
    trialSeconds: s.trialSeconds,
    sessionSeconds: s.sessionSeconds,
    startedAt: s.readyAt ?? s.startedAt,
    trialStartedAt: s.trialStartedAt,
    trialExpiresAt: s.trialExpiresAt,
    expiresAt: s.expiresAt,
    serverTime: now,
    completedAt: s.completedAt,
    refundable:
      !!s.authorizedAt &&
      !s.readyAt &&
      !["REFUNDED", "COMPLETED"].includes(s.billingState),
  };
}
export async function createAccessSession(
  userId: string,
  slug: string,
  input: {
    difficulty: "starter" | "advanced";
    level: number;
    requestId: string;
    intent: "preview" | "full";
  },
) {
  const { difficulty: mode, level, requestId, intent } = input;
  const id = `gs_${createHash("sha256").update(`${userId}|${slug}|${mode}|${requestId}`).digest("hex").slice(0, 40)}`;
  return atomic(async (tx) => {
    const old = await tx.gameSession.findUnique({ where: { id } });
    if (old) return sessionView(old);
    const game = await tx.game.findUnique({
      where: { slug },
      include: { unlock: true },
    });
    assert(game?.visible, 404, "Game not available.");
    const a = await accessFor(tx, slug, mode);
    assert(a.active, 403, "This mode is currently unavailable.");
    // Existing expansion owners retain their agreed permanent access, even if a later mode price changes.
    const owned = game.unlock
      ? await tx.userEntitlement.findUnique({
          where: { userId_unlockId: { userId, unlockId: game.unlock.id } },
        })
      : null;
    const permanent =
      mode === "advanced" && owned && a.accessType !== "FREE_FULL";
    if (
      mode === "advanced" &&
      (a.accessType === "PERMANENT_UNLOCK" || permanent)
    ) {
      assert(owned, 403, "Unlock this expansion in the store first.");
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      assert(
        wallet.debt === 0,
        409,
        "Clear your wallet reconciliation amount before playing advanced modes.",
      );
    }
    if (a.accessType === "PERMANENT_UNLOCK")
      assert(
        mode === "advanced" && owned,
        403,
        "Purchase permanent access in Expansions first.",
      );
    if (slug === "hive-quest" && level > 1) {
      const p = await tx.userGameProgress.findUnique({
        where: { userId_gameSlug: { userId, gameSlug: slug } },
      });
      assert(
        (p?.campaign as Record<string, number> | null)?.[
          `${mode}:${level - 1}`
        ],
        403,
        "Complete the preceding hive first.",
      );
    }
    assert(
      (await tx.gameSession.count({
        where: {
          userId,
          OR: [{ completedAt: null }, { completedAt: { isSet: false } }],
          startedAt: { gt: new Date(Date.now() - 600000) },
        },
      })) < 10,
      429,
      "Finish or wait for an open session before starting another.",
    );
    const free =
      a.accessType === "FREE_FULL" ||
      !!permanent ||
      a.accessType === "PERMANENT_UNLOCK";
    const trial =
      !free && intent === "preview" && a.accessType === "FREE_TRIAL_THEN_PAID";
    assert(
      intent !== "preview" || free || trial,
      400,
      "This mode has no free preview.",
    );
    if (trial) {
      const grantId = `${userId}:${slug}:${mode}:${new Date().toISOString().slice(0, 10)}`;
      const grant = await tx.trialGrant.findUnique({ where: { id: grantId } });
      if (grant) {
        const previous = await tx.gameSession.findUniqueOrThrow({
          where: { id: grant.sessionId },
        });
        assert(
          !previous.completedAt,
          409,
          "Today's practice preview has already been used. Choose a full session or return after midnight UTC.",
        );
        return sessionView(previous);
      }
      await tx.trialGrant.create({ data: { id: grantId, sessionId: id } });
    }
    const session = await tx.gameSession.create({
      data: {
        id,
        userId,
        gameSlug: slug,
        difficulty: mode,
        level,
        seed: sessionSeed(slug, mode, level),
        accessType: permanent ? "PERMANENT_UNLOCK" : a.accessType,
        coinPrice: free ? 0 : a.coinPrice,
        pricingVersion: a.version,
        sessionSeconds: Math.min(a.sessionSeconds, timeLimit(slug)),
        trialSeconds: trial ? a.trialSeconds : 0,
        billingState: free || trial ? "CREATED" : "PAYMENT_REQUIRED",
        ranked: free && mode === "starter",
      },
    });
    return sessionView(session);
  });
}
export async function authorizeSession(
  userId: string,
  id: string,
  consent: { confirmedPrice: number; pricingVersion: number },
  verified: boolean,
) {
  return atomic(async (tx) => {
    const s = await tx.gameSession.findFirst({ where: { id, userId } });
    assert(s, 404, "Session not found.");
    assert(
      s.coinPrice === consent.confirmedPrice &&
        s.pricingVersion === consent.pricingVersion,
      409,
      "Confirm the exact session price shown on this page.",
    );
    if (s.authorizedAt) {
      assert(
        !["REFUNDED", "COMPLETED", "ABANDONED"].includes(s.billingState) &&
          (!s.expiresAt || s.expiresAt > new Date()),
        409,
        "This authorization has ended.",
      );
      return sessionView(s);
    }
    assert(verified, 403, "Verify your email before spending coins.");
    assert(
      s.coinPrice > 0 &&
        [
          "PAYMENT_REQUIRED",
          "TRIAL_ACTIVE",
          "TRIAL_EXPIRED",
          "CREATED",
        ].includes(s.billingState),
      409,
      "This session cannot be purchased.",
    );
    assert(
      s.startedAt.getTime() > Date.now() - 30 * 60000,
      409,
      "This session quote expired. Start a new session.",
    );
    await ledger(
      tx,
      userId,
      -s.coinPrice,
      "game_session_charge",
      `game-session:${id}`,
      `${s.gameSlug} · ${s.difficulty} · one full session`,
    );
    return sessionView(
      await tx.gameSession.update({
        where: { id },
        data: {
          billingState: "PAYMENT_AUTHORIZED",
          authorizedAt: new Date(),
          readyAt: null,
          trialExpiresAt: null,
          expiresAt: new Date(Date.now() + 10 * 60000),
          ranked: false,
          seed: sessionSeed(s.gameSlug, s.difficulty, s.level),
        },
      }),
    );
  });
}
export async function readySession(userId: string, id: string) {
  return atomic(async (tx) => {
    const s = await tx.gameSession.findFirst({ where: { id, userId } });
    assert(s, 404, "Session not found.");
    if (["ACTIVE", "TRIAL_ACTIVE"].includes(s.billingState))
      return sessionView(s);
    assert(
      ["CREATED", "PAYMENT_AUTHORIZED"].includes(s.billingState),
      409,
      "This session is not ready to start.",
    );
    assert(
      s.startedAt.getTime() > Date.now() - 30 * 60000 &&
        (!s.expiresAt || s.expiresAt > new Date()),
      409,
      "The launch window expired. Cancel this unstarted session for a coin refund.",
    );
    const now = new Date(),
      trial = s.trialSeconds > 0 && !s.authorizedAt;
    const expiresAt = new Date(
      now.getTime() + (trial ? s.trialSeconds : s.sessionSeconds) * 1000,
    );
    return sessionView(
      await tx.gameSession.update({
        where: { id },
        data: {
          billingState: trial ? "TRIAL_ACTIVE" : "ACTIVE",
          readyAt: now,
          expiresAt,
          ...(trial ? { trialStartedAt: now, trialExpiresAt: expiresAt } : {}),
        },
      }),
    );
  });
}
export async function cancelSession(userId: string, id: string) {
  return atomic(async (tx) => {
    const s = await tx.gameSession.findFirst({ where: { id, userId } });
    assert(s, 404, "Session not found.");
    if (["REFUNDED", "COMPLETED", "ABANDONED"].includes(s.billingState))
      return sessionView(s);
    const refundable = !!s.authorizedAt && !s.readyAt;
    if (refundable)
      await ledger(
        tx,
        userId,
        s.coinPrice,
        "game_session_refund",
        `game-session-refund:${id}`,
        "Unstarted game session refunded",
      );
    return sessionView(
      await tx.gameSession.update({
        where: { id },
        data: {
          billingState: refundable ? "REFUNDED" : "ABANDONED",
          completedAt: new Date(),
        },
      }),
    );
  });
}
export async function refundUnstartedSessions() {
  const stale = await db.gameSession.findMany({
    where: {
      billingState: "PAYMENT_AUTHORIZED",
      readyAt: null,
      expiresAt: { lt: new Date() },
    },
    take: 100,
  });
  for (const s of stale) await cancelSession(s.userId, s.id);
}
export async function expireGameSessions() {
  await db.gameSession.updateMany({
    where: { billingState: "TRIAL_ACTIVE", trialExpiresAt: { lt: new Date() } },
    data: { billingState: "TRIAL_EXPIRED" },
  });
  await db.gameSession.updateMany({
    where: {
      billingState: "ACTIVE",
      expiresAt: { lt: new Date(Date.now() - 5000) },
    },
    data: { billingState: "EXPIRED" },
  });
  await db.gameSession.updateMany({
    where: {
      billingState: { in: ["CREATED", "PAYMENT_REQUIRED"] },
      startedAt: { lt: new Date(Date.now() - 30 * 60000) },
    },
    data: { billingState: "EXPIRED" },
  });
}

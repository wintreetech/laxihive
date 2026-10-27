import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db, atomic, assert } from "../config/database.js";
import { verifyPassword } from "../middleware/auth.middleware.js";
import { fulfillCoinPurchase } from "./wallet.service.js";

export const settlementSchema = z
  .object({
    requestId: z.uuid(),
    externalReference: z.string().trim().min(8).max(160),
    evidenceReference: z.string().trim().min(10).max(500),
    explanation: z.string().trim().min(20).max(1500),
    password: z.string().min(1).max(128),
    confirmed: z.literal(true),
  })
  .strict();
export const settlementDecisionSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().trim().min(20).max(1000),
    password: z.string().min(1).max(128),
    confirmed: z.literal(true),
  })
  .strict();
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const snapshot = (p: any) => ({
  userId: p.userId,
  provider: p.provider,
  cents: p.cents,
  currency: p.currency,
  coins: p.coins,
  checkoutId: p.checkoutId,
});
async function stepUp(actorId: string, password: string) {
  const actor = await db.user.findUnique({ where: { id: actorId } });
  assert(
    actor?.role === "ADMIN" && actor.status === "ACTIVE" && actor.verifiedAt,
    403,
    "A verified active administrator is required.",
  );
  assert(
    await verifyPassword(password, actor.passwordHash),
    403,
    "Confirm your administrator password.",
  );
  return actor.passwordHash;
}
async function authorizeReview(
  tx: Prisma.TransactionClient,
  actorId: string,
  passwordHash: string,
) {
  await tx.siteSettings.upsert({
    where: { id: "global" },
    update: { revision: { increment: 1 } },
    create: { id: "global", revision: 1 },
  });
  const actor = await tx.user.findUnique({ where: { id: actorId } });
  assert(
    actor?.role === "ADMIN" &&
      actor.status === "ACTIVE" &&
      actor.verifiedAt &&
      actor.passwordHash === passwordHash,
    403,
    "Administrator authorization changed. Sign in and review again.",
  );
}
export async function proposeSettlement(
  actorId: string,
  paymentId: string,
  input: unknown,
) {
  const data = settlementSchema.parse(input);
  const actorHash = await stepUp(actorId, data.password);
  const payloadHash = hash({
    paymentId,
    externalReference: data.externalReference,
    evidenceReference: data.evidenceReference,
    explanation: data.explanation,
  });
  return atomic(async (tx) => {
    await authorizeReview(tx, actorId, actorHash);
    const previous = await tx.settlementReview.findUnique({
      where: { id: data.requestId },
    });
    if (previous) {
      assert(
        previous.payloadHash === payloadHash &&
          previous.initiatedBy === actorId,
        409,
        "This request ID belongs to a different review.",
      );
      return previous;
    }
    const p = await tx.payment.findUnique({ where: { id: paymentId } });
    assert(p, 404, "Payment not found.");
    assert(
      p.userId !== actorId,
      403,
      "Administrators cannot review their own purchases.",
    );
    assert(
      !p.credited && p.refundedCents === 0 && p.disputeCents === 0,
      409,
      "This order is already fulfilled or has a payment reversal. Investigate it before settlement review.",
    );
    await tx.payment.update({
      where: { id: paymentId },
      data: { settlementRevision: { increment: 1 } },
    });
    assert(
      !(await tx.settlementReview.findFirst({
        where: { paymentId, status: "PENDING" },
      })),
      409,
      "This payment already has a pending settlement review.",
    );
    const review = await tx.settlementReview.create({
      data: {
        id: data.requestId,
        paymentId,
        initiatedBy: actorId,
        externalReference: data.externalReference,
        evidenceReference: data.evidenceReference,
        explanation: data.explanation,
        evidenceKey: hash([p.provider, data.externalReference.toLowerCase()]),
        paymentSnapshot: snapshot(p),
        payloadHash,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        action: "payment.settlement.proposed",
        detail: {
          paymentId,
          reviewId: review.id,
          externalReference: data.externalReference,
          evidenceReference: data.evidenceReference,
          explanation: data.explanation,
        },
      },
    });
    return review;
  });
}
export async function decideSettlement(
  actorId: string,
  reviewId: string,
  input: unknown,
) {
  const data = settlementDecisionSchema.parse(input);
  const actorHash = await stepUp(actorId, data.password);
  return atomic(async (tx) => {
    await authorizeReview(tx, actorId, actorHash);
    const review = await tx.settlementReview.findUnique({
      where: { id: reviewId },
    });
    assert(review, 404, "Settlement review not found.");
    assert(
      review.initiatedBy !== actorId,
      403,
      "A different administrator must independently review this settlement.",
    );
    if (review.status === "SUPERSEDED") return review;
    if (review.status !== "PENDING") {
      assert(
        (review.status === "APPROVED" && data.decision === "APPROVE") ||
          (review.status === "REJECTED" && data.decision === "REJECT"),
        409,
        "This review has already been resolved.",
      );
      return review;
    }
    const p = await tx.payment.findUniqueOrThrow({
      where: { id: review.paymentId },
    });
    assert(
      p.userId !== actorId,
      403,
      "Administrators cannot approve their own purchases.",
    );
    assert(
      hash(snapshot(p)) === hash(snapshot(review.paymentSnapshot)),
      409,
      "The payment changed after review began. Do not approve this evidence.",
    );
    await tx.payment.update({
      where: { id: p.id },
      data: { settlementRevision: { increment: 1 } },
    });
    let status = data.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    if (data.decision === "APPROVE") {
      if (p.credited) status = "SUPERSEDED";
      else {
        assert(
          p.refundedCents === 0 && p.disputeCents === 0,
          409,
          "A reversed or disputed payment cannot be manually fulfilled.",
        );
        assert(
          !(await tx.settlementClaim.findUnique({
            where: { id: review.evidenceKey },
          })),
          409,
          "This external settlement reference has already fulfilled another payment.",
        );
        await tx.settlementClaim.create({
          data: {
            id: review.evidenceKey,
            paymentId: p.id,
            reviewId: review.id,
          },
        });
        await fulfillCoinPurchase(tx, p, "MANUAL_SETTLEMENT");
      }
    }
    const result = await tx.settlementReview.update({
      where: { id: review.id },
      data: {
        status,
        approvedBy: actorId,
        reviewedAt: new Date(),
        decisionReason: data.reason,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        action: `payment.settlement.${status.toLowerCase()}`,
        detail: {
          paymentId: p.id,
          reviewId: review.id,
          initiatedBy: review.initiatedBy,
          reason: data.reason,
          fulfillmentSource:
            status === "APPROVED" ? "MANUAL_SETTLEMENT" : p.fulfillmentSource,
        },
      },
    });
    return result;
  });
}

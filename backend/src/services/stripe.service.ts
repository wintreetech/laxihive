import Stripe from "stripe";
import type { Request, Response } from "express";
import { db, atomic, assert, HttpError } from "../config/database.js";
import { ledger, fulfillCoinPurchase } from "./wallet.service.js";

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  assert(
    key.startsWith("sk_test_"),
    503,
    "Live commerce is disabled pending launch review.",
  );
  return new Stripe(key, { maxNetworkRetries: 2 });
}

// Signature verification runs against the raw body, before the JSON middleware.
export function webhook(stripe: Stripe | null) {
  return async (req: Request, res: Response) => {
    assert(
      stripe && process.env.STRIPE_WEBHOOK_SECRET,
      503,
      "Webhook is not configured.",
    );
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.get("stripe-signature") || "",
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      throw new HttpError(400, "Invalid webhook signature.");
    }
    assert(!event.livemode, 400, "Live events are not accepted.");
    await processStripeEvent(stripe, event);
    res.json({ received: true });
  };
}

export async function processStripeEvent(stripe: Stripe, event: Stripe.Event) {
  if (await db.stripeEvent.findUnique({ where: { id: event.id } })) return;
  const obj = event.data.object as any;
  const checkout = event.type.startsWith("checkout.session.") ? obj : null;
  const intentId = event.type.startsWith("payment_intent.")
    ? obj.id
    : typeof obj.payment_intent === "string"
      ? obj.payment_intent
      : obj.payment_intent?.id;
  const supported = [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
    "payment_intent.payment_failed",
    "charge.refunded",
    "charge.dispute.created",
    "charge.dispute.closed",
    "charge.dispute.updated",
  ];
  if (!supported.includes(event.type)) return;
  let intent: Stripe.PaymentIntent | null = null;
  if (intentId)
    intent = await stripe.paymentIntents.retrieve(intentId, {
      expand: ["latest_charge"],
    });
  const paymentId =
    checkout?.metadata?.paymentId || intent?.metadata?.paymentId;
  const p = paymentId
    ? await db.payment.findUnique({ where: { id: paymentId } })
    : null;
  assert(
    p && p.provider === "stripe",
    400,
    "Webhook references an unknown Stripe payment.",
  );
  assert(
    !checkout || checkout.id === p.checkoutId,
    400,
    "Checkout reference mismatch.",
  );
  if (intent) {
    assert(
      intent.currency === p.currency && intent.metadata.userId === p.userId,
      400,
      "Payment owner or currency mismatch.",
    );
    assert(intent.amount >= p.cents, 400, "Payment amount mismatch.");
  }
  const charge =
    intent?.latest_charge && typeof intent.latest_charge === "object"
      ? (intent.latest_charge as Stripe.Charge)
      : null;
  let dispute: any = null;
  if (charge?.disputed) {
    const disputes = await stripe.disputes.list({
      charge: charge.id,
      limit: 10,
    });
    dispute = disputes.data.find(
      (d) => d.status !== "won" && d.status !== "warning_closed",
    );
  }
  const refunded = charge?.amount_refunded ?? 0;
  await atomic(async (tx) => {
    if (await tx.stripeEvent.findUnique({ where: { id: event.id } })) return;
    const current = await tx.payment.findUniqueOrThrow({ where: { id: p.id } });
    const cumulativeRefund = Math.max(current.refundedCents, refunded);
    let disputeCents = current.disputeCents,
      disputeEventCreated = current.disputeEventCreated;
    if (
      event.type.startsWith("charge.dispute.") &&
      (event.created ?? 0) >= disputeEventCreated
    ) {
      disputeCents = ["won", "warning_closed"].includes(obj.status)
        ? 0
        : obj.amount;
      disputeEventCreated = event.created ?? 0;
    } else if (dispute && disputeEventCreated === 0)
      disputeCents = Math.max(disputeCents, dispute.amount);
    const reversalCents = Math.max(cumulativeRefund, disputeCents);
    const paid =
      intent?.status === "succeeded" &&
      (!checkout || checkout.payment_status === "paid");
    if (paid && !current.credited) {
      assert(
        intent!.amount_received >= p.cents,
        400,
        "Payment is not fully settled.",
      );
      await fulfillCoinPurchase(tx, current, "GATEWAY");
    }
    const credited = current.credited || !!paid;
    // Proportional reversal includes tax in the charge total; cumulative values avoid duplicate debits.
    const target = credited
      ? Math.min(
          p.coins,
          Math.ceil(
            (p.coins * Math.min(reversalCents, charge?.amount ?? p.cents)) /
              (charge?.amount ?? p.cents),
          ),
        )
      : 0;
    const delta = current.reversedCoins - target;
    if (delta)
      await ledger(
        tx,
        p.userId,
        delta,
        delta < 0 ? "refund" : "refund_recovery",
        `reversal:${p.id}:${event.id}`,
        disputeCents
          ? "Payment dispute adjustment"
          : "Payment refund adjustment",
        true,
      );
    let status = current.status;
    if (credited)
      status = disputeCents
        ? "disputed"
        : target >= p.coins
          ? "refunded"
          : target > 0
            ? "partially_refunded"
            : "paid";
    else if (event.type.endsWith("expired")) status = "expired";
    else if (event.type.includes("failed")) status = "failed";
    await tx.payment.update({
      where: { id: p.id },
      data: {
        credited,
        reversedCoins: target,
        refundedCents: cumulativeRefund,
        disputeCents,
        disputeEventCreated,
        status,
        ...(intent ? { intentId: intent.id } : {}),
      },
    });
    await tx.stripeEvent.create({ data: { id: event.id, type: event.type } });
  });
}

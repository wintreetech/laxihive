import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { PurchaseCurrency } from "../../shared/rules.js";
import { z } from "zod";
import { customerEmailAllowed } from "../config/account-policy.js";
import { quoteSnapshot } from "../services/coin-quote.service.js";
import { db, atomic, assert } from "../config/database.js";
import {
  gatewayConfig,
  gatewayReady,
  gatewayCurrencies,
  gatewayInquiryAvailable,
  buildGatewayRequest,
  verifyNotification,
  verifyHostedResponse,
  reconcileTransactworld,
  inquirePayment,
  decimalCents,
  type Inquiry,
} from "../services/transactworld.service.js";

export async function initTransactworld(req: Request, res: Response) {
  const c = gatewayConfig();
  assert(
    process.env.PAYMENTS_ENABLED === "true" && gatewayReady(c),
    503,
    "Checkout is awaiting merchant setup or activation. No payment has been taken.",
  );
  assert(
    customerEmailAllowed(!!req.auth?.verified),
    403,
    "Verify your email before purchasing coins.",
  );
  const { quoteId } = z
    .object({ quoteId: z.string().max(64) })
    .strict()
    .parse(req.body);
  const payment = await atomic(async (tx) => {
    const quote = await tx.coinQuote.findUnique({ where: { id: quoteId } });
    assert(
      quote &&
        quote.userId === req.auth!.userId &&
        quote.expiresAt > new Date(),
      400,
      "This quote is invalid or expired.",
    );
    assert(
      gatewayCurrencies(c).includes(
        quote.currency.toUpperCase() as PurchaseCurrency,
      ),
      400,
      `${quote.currency.toUpperCase()} checkout is unavailable. Choose ${gatewayCurrencies(c).join(" or ")}.`,
    );
    const pricing = await tx.coinPricingConfig.findUniqueOrThrow({
      where: { id: "global" },
    });
    assert(
      pricing.enabled && pricing.version === quote.pricingVersion,
      409,
      "Pricing changed. Request a new quote.",
    );
    const existing = await tx.payment.findUnique({ where: { quoteId } });
    if (existing) {
      assert(
        existing.provider === "transactworld" && existing.status === "pending",
        409,
        "This quote already has a processed checkout.",
      );
      return existing;
    }
    return tx.payment.create({
      data: {
        provider: "transactworld",
        userId: req.auth!.userId,
        quoteId,
        cents: quote.cents,
        currency: quote.currency,
        coins: quote.coins,
        ...quoteSnapshot(quote),
        checkoutId: createHash("sha256").update(randomBytes(32)).digest("hex"),
      },
    });
  });
  res.json(
    buildGatewayRequest(
      payment,
      c.allowLocalCheckout && process.env.IP
        ? process.env.IP
        : req.ip || req.socket.remoteAddress || "",
      c,
    ),
  );
}

export function transactworldCallback(inquiry: Inquiry = inquirePayment) {
  return async (req: Request, res: Response) => {
    const c = gatewayConfig(),
      transactionId = String(req.params.orderItemId);
    const notification = verifyNotification(req.body, transactionId, c);
    const payment = await db.payment.findFirst({
      where: { provider: "transactworld", checkoutId: transactionId },
    });
    assert(payment, 404, "Gateway order not found.");
    assert(
      decimalCents(notification.amount) === payment.cents,
      400,
      "Gateway callback amount mismatch.",
    );
    assert(
      !payment.intentId || payment.intentId === notification.paymentId,
      409,
      "This order is already linked to a different gateway payment.",
    );
    const id = createHash("sha256")
      .update(
        `${payment.id}|${notification.paymentId}|${notification.amount}|${notification.transactionStatus}|${notification.checksum}`,
      )
      .digest("hex");
    await atomic(async (tx) => {
      const p = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      assert(
        !p.intentId || p.intentId === notification.paymentId,
        409,
        "Gateway payment reference mismatch.",
      );
      await tx.payment.update({
        where: { id: p.id },
        data: { intentId: notification.paymentId },
      });
      await tx.gatewayNotification.upsert({
        where: { id },
        update: {},
        create: {
          id,
          paymentId: p.id,
          signedFields: {
            paymentId: notification.paymentId,
            merchantTransactionId: notification.merchantTransactionId,
            amount: notification.amount,
            transactionStatus: notification.transactionStatus,
          },
        },
      });
    });
    if (gatewayInquiryAvailable(c))
      await reconcileTransactworld(
        { ...payment, intentId: notification.paymentId },
        inquiry,
        c,
      );
    // A short Y can mean authorization. Without inquiry, wait for the browser
    // response whose checksum authenticates the full capturesuccess status.
    await db.gatewayNotification.update({
      where: { id },
      data: { processedAt: new Date() },
    });
    res.status(200).json({ received: true });
  };
}

export async function transactworldReturn(req: Request, res: Response) {
  const payment = await db.payment.findFirst({
    where: {
      provider: "transactworld",
      checkoutId: String(req.params.orderItemId),
    },
  });
  assert(payment, 404, "Purchase not found.");
  if (req.method === "POST") {
    const c = gatewayConfig();
    const result = verifyHostedResponse(req.body, payment.checkoutId!, c);
    assert(
      decimalCents(result.amount) === payment.cents &&
        result.currency.toLowerCase() === payment.currency,
      400,
      "Gateway return amount or currency mismatch.",
    );
    const id = createHash("sha256")
      .update(
        `return|${payment.id}|${result.paymentId}|${result.amount}|${result.status}|${result.checksum}`,
      )
      .digest("hex");
    await atomic(async (tx) => {
      const current = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      assert(
        !current.intentId || current.intentId === result.paymentId,
        409,
        "Gateway payment reference mismatch.",
      );
      await tx.payment.update({
        where: { id: payment.id },
        data: { intentId: result.paymentId },
      });
      await tx.gatewayNotification.upsert({
        where: { id },
        update: {},
        create: {
          id,
          paymentId: payment.id,
          signedFields: {
            paymentId: result.paymentId,
            merchantTransactionId: result.merchantTransactionId,
            amount: result.amount,
            status: result.status,
          },
        },
      });
    });
    if (gatewayInquiryAvailable(c)) {
      await reconcileTransactworld(
        { ...payment, intentId: result.paymentId },
        inquirePayment,
        c,
      );
    } else if (
      process.env.NODE_ENV !== "production" &&
      !/refund|chargeback/i.test(result.status)
    ) {
      // Only the full status authenticated by the hosted response can confirm
      // capture. Currency must also match the immutable stored quote.
      await reconcileTransactworld(
        { ...payment, intentId: result.paymentId },
        async () => ({
          ...result,
          transactionStatus:
            result.status === "capturesuccess"
              ? "Y"
              : /fail|declin|cancel|error/i.test(result.status)
                ? "N"
                : "P",
        }),
        c,
      );
    }
    await db.gatewayNotification.update({
      where: { id },
      data: { processedAt: new Date() },
    });
  }
  res.set("Cache-Control", "no-store");
  res.redirect(
    303,
    `${process.env.APP_ORIGIN}/purchase/success?payment=${encodeURIComponent(payment.id)}`,
  );
}

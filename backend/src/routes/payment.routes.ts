import { Router } from "express";
import type Stripe from "stripe";
import { z } from "zod";
import { db, atomic, assert, HttpError } from "../config/database.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { purchaseCurrencies } from "../../shared/rules.js";
import { ledger } from "../services/wallet.service.js";
import { customerEmailAllowed } from "../config/account-policy.js";
import {
  quoteCoinPricing,
  quoteSnapshot,
} from "../services/coin-quote.service.js";
import { fxSettings, loadFxRate } from "../services/fx.service.js";
import {
  gatewayConfig,
  gatewayReady,
  gatewayCurrencies,
  gatewayInquiryAvailable,
  reconcileTransactworld,
} from "../services/transactworld.service.js";
export function paymentsRoutes(stripe: Stripe | null) {
  const r = Router();
  r.get("/coins/config", async (_req, res) => {
    const config = await db.coinPricingConfig.findUniqueOrThrow({
      where: { id: "global" },
    });
    const provider = process.env.PAYMENT_PROVIDER || "transactworld";
    const tw = gatewayConfig();
    const paymentsEnabled = process.env.PAYMENTS_ENABLED === "true";
    const paymentsAvailable =
      paymentsEnabled &&
      (provider === "transactworld" ? gatewayReady(tw) : !!stripe);
    const published = await db.gameAccessConfig.findMany({
      where: {
        active: true,
        coinPrice: { gt: 0 },
        accessType: {
          in: ["FREE_TRIAL_THEN_PAID", "PAID_FROM_START", "PREMIUM_SESSION"],
        },
      },
    });
    const visible = await db.game.findMany({ where: { visible: true } });
    let fxRate = null,
      fxIssue = null;
    if (config.pricingPolicy === "FX_BASED")
      try {
        fxRate = await loadFxRate(
          fxSettings().base,
          fxSettings().base === "EUR" ? "USD" : "EUR",
        );
      } catch {
        fxIssue =
          "Exchange-rate pricing is temporarily unavailable for the other currency.";
      }
    res.json({
      ...config,
      baseCurrency: fxSettings().base,
      fxRate,
      fxIssue,
      provider,
      sessionExamples: published
        .filter((p) => visible.some((g) => g.slug === p.gameSlug))
        .map((p) => ({
          gameSlug: p.gameSlug,
          name: visible.find((g) => g.slug === p.gameSlug)!.name,
          mode: p.mode,
          coinPrice: p.coinPrice,
        })),
      currencies:
        provider === "transactworld"
          ? gatewayCurrencies(tw)
          : purchaseCurrencies,
      paymentsAvailable,
      paymentsPaused: !paymentsEnabled,
      paymentUnavailableMessage: !paymentsEnabled
        ? "Coin purchases are coming soon while merchant setup is completed. You can still play games and browse prices in USD and EUR."
        : !paymentsAvailable
          ? "Checkout is temporarily unavailable. Please try again later."
          : null,
      testMode:
        provider === "transactworld" ? tw.environment === "sandbox" : true,
    });
  });
  r.post("/coins/quote", requireAuth, async (req, res) => {
    const provider = process.env.PAYMENT_PROVIDER || "transactworld";
    const currencies =
      provider === "transactworld" ? gatewayCurrencies() : purchaseCurrencies;
    const { cents, currency } = z
      .object({
        cents: z.number().int(),
        currency: z.enum(purchaseCurrencies).default(currencies[0] || "USD"),
      })
      .parse(req.body);
    assert(
      currencies.includes(currency),
      400,
      `${currency} checkout is unavailable. Choose ${currencies.join(" or ")}.`,
    );
    const p = await db.coinPricingConfig.findUniqueOrThrow({
      where: { id: "global" },
    });
    let calculation;
    try {
      calculation = await quoteCoinPricing(cents, currency, p);
    } catch (e: any) {
      throw new HttpError(e instanceof HttpError ? e.status : 400, e.message);
    }
    const quote = await db.coinQuote.create({
      data: {
        userId: req.auth!.userId,
        cents,
        currency: currency.toLowerCase(),
        ...calculation,
        pricingVersion: p.version,
        expiresAt: new Date(Date.now() + 10 * 60000),
      },
    });
    res.status(201).json(quote);
  });
  r.get("/wallet", requireAuth, async (req, res) => {
    const w = await db.wallet.findUniqueOrThrow({
      where: { userId: req.auth!.userId },
    });
    const sums = await db.walletTransaction.groupBy({
      by: ["kind"],
      where: { walletId: w.id },
      _sum: { amount: true },
    });
    res.json({ balance: w.balance, debt: w.debt, summary: sums });
  });
  r.get("/wallet/transactions", requireAuth, async (req, res) => {
    const w = await db.wallet.findUniqueOrThrow({
      where: { userId: req.auth!.userId },
    });
    res.json(
      await db.walletTransaction.findMany({
        where: { walletId: w.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    );
  });
  r.get("/payments", requireAuth, async (req, res) =>
    res.json(
      await db.payment.findMany({
        where: { userId: req.auth!.userId },
        select: {
          id: true,
          cents: true,
          currency: true,
          coins: true,
          status: true,
          credited: true,
          createdAt: true,
          refundedCents: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ),
  );
  r.get("/payments/:id/status", requireAuth, async (req, res) => {
    const p = await db.payment.findFirst({
      where: { id: req.params.id as string, userId: req.auth!.userId },
      select: {
        id: true,
        status: true,
        cents: true,
        currency: true,
        coins: true,
        provider: true,
        gatewayVerifiedAt: true,
        credited: true,
        fulfillmentSource: true,
        manuallyVerifiedAt: true,
      },
    });
    assert(p, 404, "Purchase not found.");
    res.json({ ...p, canReconcile: gatewayInquiryAvailable() });
  });
  r.post("/payments/init", requireAuth, initTransactworld);
  r.post("/payments/:id/reconcile", requireAuth, async (req, res) => {
    const payment = await db.payment.findFirst({
      where: { id: req.params.id as string, userId: req.auth!.userId },
    });
    assert(payment, 404, "Purchase not found.");
    await reconcileTransactworld(payment);
    res.json({ message: "Gateway status checked." });
  });
  r.post("/payments/checkout", requireAuth, async (req, res) => {
    if ((process.env.PAYMENT_PROVIDER || "transactworld") === "transactworld") {
      await initTransactworld(req, res);
      return;
    }
    assert(
      stripe && process.env.PAYMENTS_ENABLED === "true",
      503,
      "Checkout is not configured yet. No payment has been taken.",
    );
    assert(
      customerEmailAllowed(req.auth!.verified),
      403,
      "Verify your email before purchasing coins.",
    );
    const { quoteId } = z
      .object({ quoteId: z.string().max(64) })
      .parse(req.body);
    const quote = await db.coinQuote.findUnique({ where: { id: quoteId } });
    assert(
      quote &&
        quote.userId === req.auth!.userId &&
        quote.expiresAt > new Date(),
      400,
      "This quote has expired. Request a new quote.",
    );
    const config = await db.coinPricingConfig.findUniqueOrThrow({
      where: { id: "global" },
    });
    assert(
      config.enabled && config.version === quote.pricingVersion,
      409,
      "Pricing changed. Request a new quote.",
    );
    const payment = await db.payment.upsert({
      where: { quoteId },
      update: {},
      create: {
        quoteId,
        userId: req.auth!.userId,
        cents: quote.cents,
        currency: quote.currency,
        coins: quote.coins,
        ...quoteSnapshot(quote),
      },
    });
    assert(
      ["pending", "failed"].includes(payment.status),
      409,
      "This purchase has already been processed.",
    );
    const user = await db.user.findUniqueOrThrow({
      where: { id: req.auth!.userId },
    });
    const checkout = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: payment.id,
        customer_email: user.email,
        metadata: { paymentId: payment.id, userId: user.id },
        payment_intent_data: {
          metadata: { paymentId: payment.id, userId: user.id },
        },
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: quote.currency,
              unit_amount: quote.cents,
              tax_behavior: "exclusive",
              product_data: {
                name: `${quote.coins.toLocaleString()} LexiHive virtual coins`,
                description:
                  "Non-transferable virtual currency. No cash value.",
              },
            },
            quantity: 1,
          },
        ],
        automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === "true" },
        success_url: `${process.env.APP_ORIGIN}/purchase/success?payment=${payment.id}`,
        cancel_url: `${process.env.APP_ORIGIN}/purchase/cancelled?payment=${payment.id}`,
        expires_at: Math.floor(Date.now() / 1000) + 1800,
      },
      { idempotencyKey: `checkout:${payment.id}` },
    );
    await db.payment.update({
      where: { id: payment.id },
      data: { checkoutId: checkout.id },
    });
    res.json({ url: checkout.url, paymentId: payment.id });
  });
  r.get("/expansions", async (req, res) => {
    const unlocks = await db.gameUnlock.findMany({
      where: { active: true },
      include: { game: { select: { name: true, visible: true } } },
    });
    const owned = req.auth
      ? await db.userEntitlement.findMany({
          where: { userId: req.auth.userId },
        })
      : [];
    res.json(
      unlocks
        .filter((u) => u.game.visible)
        .map((u) => ({ ...u, owned: owned.some((e) => e.unlockId === u.id) })),
    );
  });
  r.post("/expansions/:id/unlock", requireAuth, async (req, res) => {
    assert(
      customerEmailAllowed(req.auth!.verified),
      403,
      "Verify your email to unlock expansions.",
    );
    const result = await atomic(async (tx) => {
      const unlock = await tx.gameUnlock.findUnique({
        where: { id: req.params.id as string },
        include: { game: true },
      });
      assert(
        unlock?.active && unlock.game.visible,
        404,
        "Expansion not available.",
      );
      const key = { userId: req.auth!.userId, unlockId: unlock.id };
      const old = await tx.userEntitlement.findUnique({
        where: { userId_unlockId: key },
      });
      if (old) return old;
      await ledger(
        tx,
        key.userId,
        -unlock.price,
        "spent",
        `unlock:${key.userId}:${unlock.id}`,
        unlock.name,
      );
      return tx.userEntitlement.create({ data: key });
    });
    res.json(result);
  });
  return r;
}

import { initTransactworld } from "../controllers/transactworld.controller.js";

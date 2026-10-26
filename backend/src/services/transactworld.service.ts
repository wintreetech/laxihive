import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { Payment } from "@prisma/client";
import { z } from "zod";
import { atomic, assert, HttpError } from "../config/database.js";
import { ledger } from "./wallet.service.js";
import {
  purchaseCurrencies,
  type PurchaseCurrency,
} from "../../shared/rules.js";

export type TransactworldConfig = {
  memberId: string;
  workingKey: string;
  toType: string;
  language: string;
  paymentBrand: string;
  paymentMode: string;
  environment: "sandbox" | "live";
  origin: string;
  redirectBase: string;
  notificationBase: string;
  authToken: string;
  allowLocalCheckout?: boolean;
  supportedCurrencies?: PurchaseCurrency[];
};
export const md5 = (value: string) =>
  createHash("md5").update(value, "utf8").digest("hex");
export function gatewayConfig(): TransactworldConfig {
  const environment =
    process.env.TW_ENVIRONMENT === "live" ? "live" : "sandbox";
  const publicApi = (
    process.env.PUBLIC_API_URL || "http://localhost:4000"
  ).replace(/\/$/, "");
  const mode = (process.env.PAYMENT_MODE || "CC").trim().toUpperCase();
  const brand = (process.env.PAYMENT_BRAND || "VISA").trim().toUpperCase();
  const currencies = [
    ...new Set(
      (process.env.TW_SUPPORTED_CURRENCIES ?? "USD,EUR")
        .split(",")
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  return {
    memberId: process.env.MEMBER_ID || "",
    workingKey: process.env.WORKING_KEY || "",
    toType: process.env.TO_TYPE || "Transactworld",
    language: process.env.LANGUAGE || "ENG",
    paymentBrand: brand === "VISAS" ? "VISA" : brand,
    paymentMode: mode === "1" ? "CC" : mode,
    supportedCurrencies: currencies.every((v) =>
      purchaseCurrencies.includes(v as PurchaseCurrency),
    )
      ? (currencies as PurchaseCurrency[])
      : [],
    environment,
    origin:
      process.env.TW_GATEWAY_ORIGIN ||
      (environment === "live"
        ? "https://secure.transactworld.com"
        : "https://sandbox.transactworld.com"),
    redirectBase:
      process.env.MERCHANT_REDIRECT_URL ||
      `${publicApi}/api/payments/transactworld/return/`,
    notificationBase:
      process.env.NOTIFICATION_URL || `${publicApi}/api/payments/forward/`,
    authToken: process.env.TW_AUTH_TOKEN || "",
    allowLocalCheckout:
      process.env.NODE_ENV !== "production" &&
      process.env.TW_ALLOW_LOCAL_CHECKOUT === "true",
  };
}
export function gatewayCurrencies(
  c = gatewayConfig(),
): readonly PurchaseCurrency[] {
  return c.supportedCurrencies ?? purchaseCurrencies;
}
export function gatewaySetupIssues(c = gatewayConfig()) {
  const issues: string[] = [];
  if (
    c.origin !==
    (c.environment === "live"
      ? "https://secure.transactworld.com"
      : "https://sandbox.transactworld.com")
  )
    issues.push(
      "TW_GATEWAY_ORIGIN must match the selected live/sandbox environment.",
    );
  if (!gatewayCurrencies(c).length)
    issues.push("TW_SUPPORTED_CURRENCIES must contain USD, EUR, or both.");
  if (process.env.NODE_ENV === "production" && !c.authToken)
    issues.push(
      "TW_AUTH_TOKEN is required in production for browser-independent capture verification and recovery.",
    );
  for (const [name, value] of [
    ["MEMBER_ID", c.memberId],
    ["WORKING_KEY", c.workingKey],
  ]) {
    if (!value.trim()) issues.push(`${name} is missing.`);
  }
  for (const [name, value] of [
    ["MERCHANT_REDIRECT_URL", c.redirectBase],
    ["NOTIFICATION_URL", c.notificationBase],
  ]) {
    try {
      callbackUrl(value, "readiness", c);
    } catch {
      issues.push(
        `${name} must be a valid ${c.environment === "live" ? "public HTTPS " : ""}backend callback URL. Set PUBLIC_API_URL to derive the default routes.`,
      );
    }
  }
  return issues;
}
export function gatewayReady(c = gatewayConfig()) {
  return gatewaySetupIssues(c).length === 0;
}
export function decimalCents(value: unknown) {
  assert(
    typeof value === "string" && /^\d{1,8}\.\d{2}$/.test(value),
    400,
    "The gateway amount must be an exact decimal currency value.",
  );
  const [whole, fraction] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction);
  assert(Number.isSafeInteger(cents), 400, "Invalid gateway amount.");
  return cents;
}
function callbackUrl(
  base: string,
  transactionId: string,
  c: TransactworldConfig,
) {
  const url = new URL(base.endsWith("/") ? base : base + "/");
  assert(
    !url.search && !url.hash && !url.username && !url.password,
    503,
    "Gateway callback URLs must not contain credentials, query strings or fragments.",
  );
  assert(
    ["http:", "https:"].includes(url.protocol),
    503,
    "Gateway callbacks must use HTTP or HTTPS.",
  );
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (c.environment === "live" && !(c.allowLocalCheckout && loopback))
    assert(
      url.protocol === "https:" &&
        !["localhost", "0.0.0.0", "[::1]"].includes(url.hostname) &&
        !url.hostname.endsWith(".localhost") &&
        !/^127\./.test(url.hostname),
      503,
      "Live gateway callbacks require a public HTTPS backend URL.",
    );
  return `${url.toString()}${encodeURIComponent(transactionId)}`;
}
export function requestChecksum(
  c: TransactworldConfig,
  amount: string,
  merchantTransactionId: string,
  redirectUrl: string,
) {
  return md5(
    [
      c.memberId,
      c.toType,
      amount,
      merchantTransactionId,
      redirectUrl,
      c.workingKey,
    ].join("|"),
  );
}
export function responseChecksum(
  c: TransactworldConfig,
  paymentId: string,
  merchantTransactionId: string,
  amount: string,
  status: string,
) {
  return md5(
    [paymentId, merchantTransactionId, amount, status, c.workingKey].join("|"),
  );
}
export function buildGatewayRequest(
  payment: Pick<Payment, "id" | "checkoutId" | "cents" | "coins" | "currency">,
  shopperIP: string,
  c = gatewayConfig(),
) {
  assert(
    c.memberId && c.workingKey,
    503,
    "Transactworld credentials are not configured.",
  );
  assert(payment.checkoutId, 500, "This payment has no transaction reference.");
  const currency = payment.currency.toUpperCase();
  assert(["USD", "EUR"].includes(currency), 400, "Choose USD or EUR.");
  assert(
    gatewayCurrencies(c).includes(currency as PurchaseCurrency),
    400,
    `${currency} checkout is unavailable. Choose ${gatewayCurrencies(c).join(" or ")}.`,
  );
  const merchantTransactionId = payment.checkoutId,
    amount = (payment.cents / 100).toFixed(2),
    merchantRedirectUrl = callbackUrl(c.redirectBase, merchantTransactionId, c);
  const ip = shopperIP.replace(/^::ffff:/, "");
  assert(isIP(ip), 400, "A valid shopper IP address is required.");
  return {
    provider: "transactworld",
    paymentId: payment.id,
    forwardUrl: `${c.origin}/transaction/Checkout`,
    paymentData: {
      memberId: c.memberId,
      totype: c.toType,
      language: c.language,
      amount,
      currency,
      TMPL_AMOUNT: amount,
      TMPL_CURRENCY: currency,
      paymentType: "DB",
      paymentBrand: c.paymentBrand,
      paymentMode: c.paymentMode,
      ip,
      merchantTransactionId,
      merchantRedirectUrl,
      notificationUrl: callbackUrl(
        c.notificationBase,
        merchantTransactionId,
        c,
      ),
      orderDescription: `${payment.coins} LexiHive virtual coins`,
      checksum: requestChecksum(
        c,
        amount,
        merchantTransactionId,
        merchantRedirectUrl,
      ),
    },
  };
}
const notificationSchema = z.object({
  paymentId: z.coerce.string().regex(/^\d{1,32}$/),
  merchantTransactionId: z.string().regex(/^[a-f0-9]{64}$/),
  amount: z.string().max(32),
  transactionStatus: z.enum(["Y", "N", "P"]),
  checksum: z.string().regex(/^[a-fA-F0-9]{32}$/),
});
export function verifyNotification(
  body: unknown,
  transactionId: string,
  c = gatewayConfig(),
) {
  assert(c.workingKey, 503, "Gateway signing credentials are missing.");
  const n = notificationSchema.parse(body);
  assert(
    n.merchantTransactionId === transactionId,
    400,
    "Gateway transaction reference mismatch.",
  );
  decimalCents(n.amount);
  const expected = Buffer.from(
    responseChecksum(
      c,
      n.paymentId,
      n.merchantTransactionId,
      n.amount,
      n.transactionStatus,
    ),
    "hex",
  );
  assert(
    timingSafeEqual(Buffer.from(n.checksum, "hex"), expected),
    400,
    "Invalid Transactworld callback checksum.",
  );
  return n;
}
// The browser response signs the full status. Notifications sign the short
// transactionStatus instead. Never substitute one for the other.
export function verifyHostedResponse(
  body: unknown,
  transactionId: string,
  c = gatewayConfig(),
) {
  assert(c.workingKey, 503, "Gateway signing credentials are missing.");
  const n = z
    .object({
      paymentId: z.coerce.string().regex(/^\d{1,32}$/),
      merchantTransactionId: z.string().regex(/^[a-f0-9]{64}$/),
      amount: z.string().max(32),
      currency: z
        .enum(["USD", "EUR", "usd", "eur"])
        .transform((v) => v.toUpperCase()),
      status: z.string().regex(/^[a-zA-Z0-9_]{1,64}$/),
      checksum: z.string().regex(/^[a-fA-F0-9]{32}$/),
    })
    .parse(body);
  assert(
    n.merchantTransactionId === transactionId,
    400,
    "Gateway transaction reference mismatch.",
  );
  decimalCents(n.amount);
  const expected = responseChecksum(
    c,
    n.paymentId,
    n.merchantTransactionId,
    n.amount,
    n.status,
  );
  assert(
    timingSafeEqual(
      Buffer.from(n.checksum, "hex"),
      Buffer.from(expected, "hex"),
    ),
    400,
    "Invalid Transactworld return checksum.",
  );
  return n;
}
export type InquiryResult = {
  paymentId: string;
  merchantTransactionId: string;
  amount: string;
  currency: string;
  status: string;
  transactionStatus: string;
  refundamount?: string;
  chargebackamount?: string;
};
export type Inquiry = (
  paymentId: string,
  c: TransactworldConfig,
) => Promise<InquiryResult>;
export const inquirePayment: Inquiry = async (paymentId, c) => {
  assert(
    c.authToken,
    503,
    "Set TW_AUTH_TOKEN to enable server-to-server payment verification.",
  );
  const body = new URLSearchParams({
    "authentication.memberId": c.memberId,
    "authentication.checksum": md5(
      `${c.memberId}|${c.workingKey}|${paymentId}`,
    ),
    paymentType: "IN",
    idType: "PID",
    paymentId,
  });
  let response: globalThis.Response;
  try {
    response = await fetch(`${c.origin}/transactionServices/REST/v1/inquiry`, {
      method: "POST",
      headers: {
        AuthToken: c.authToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
  } catch {
    throw new HttpError(
      503,
      "Gateway verification is temporarily unavailable. Your payment remains pending.",
    );
  }
  assert(
    response.ok,
    503,
    "Gateway verification failed. Check the merchant AuthToken and gateway account configuration.",
  );
  const json = await response.json().catch(() => null);
  assert(
    json && typeof json === "object",
    503,
    "The gateway returned an invalid verification response.",
  );
  // Accept only the documented response fields; never persist card/customer data from the provider.
  return z
    .object({
      paymentId: z.coerce.string(),
      merchantTransactionId: z.string(),
      amount: z.string(),
      currency: z.string(),
      status: z.string(),
      transactionStatus: z.string(),
      refundamount: z.string().optional(),
      chargebackamount: z.string().optional(),
    })
    .parse(json);
};
export async function reconcileTransactworld(
  payment: Payment,
  inquiry: Inquiry = inquirePayment,
  c = gatewayConfig(),
) {
  assert(
    payment.provider === "transactworld" && payment.intentId,
    409,
    "A signed gateway notification is required before checking this purchase.",
  );
  const verified = await inquiry(payment.intentId, c);
  assert(
    verified.paymentId === payment.intentId &&
      verified.merchantTransactionId === payment.checkoutId,
    400,
    "The verified gateway payment does not match this order.",
  );
  assert(
    verified.currency.toLowerCase() === payment.currency &&
      decimalCents(verified.amount) === payment.cents,
    400,
    "The verified gateway amount or currency does not match the order.",
  );
  const captured =
    verified.status === "capturesuccess" && verified.transactionStatus === "Y";
  const refunded =
      verified.refundamount === undefined
        ? null
        : decimalCents(verified.refundamount),
    chargedBack =
      verified.chargebackamount === undefined
        ? null
        : decimalCents(verified.chargebackamount);
  // Never guess a full/partial reversal from an unsigned display status or an undocumented amount.
  if (/refund|chargeback/i.test(verified.status))
    assert(
      refunded !== null || chargedBack !== null,
      503,
      "The gateway reversal requires authoritative cumulative refund/chargeback amounts.",
    );
  return atomic(async (tx) => {
    const p = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (captured && !p.credited) {
      await ledger(
        tx,
        p.userId,
        p.coins,
        "purchased",
        `payment:transactworld:${p.id}`,
        `Transactworld coin purchase ${p.currency.toUpperCase()} ${(p.cents / 100).toFixed(2)}`,
      );
      await tx.purchase.upsert({
        where: { paymentId: p.id },
        update: {},
        create: { paymentId: p.id },
      });
    }
    const credited = p.credited || captured;
    const refundCents = Math.max(p.refundedCents, refunded ?? 0),
      disputeCents = Math.max(p.disputeCents, chargedBack ?? 0);
    assert(
      refundCents <= p.cents && disputeCents <= p.cents,
      400,
      "The gateway reversal exceeds the purchase.",
    );
    const target = credited
      ? Math.min(
          p.coins,
          Math.ceil(
            (p.coins * Math.min(p.cents, refundCents + disputeCents)) / p.cents,
          ),
        )
      : 0;
    const delta = p.reversedCoins - target;
    if (delta < 0)
      await ledger(
        tx,
        p.userId,
        delta,
        "refund",
        `tw-reversal:${p.id}:${target}`,
        "Verified Transactworld payment reversal",
        true,
      );
    const status = credited
      ? disputeCents
        ? "disputed"
        : target === p.coins
          ? "refunded"
          : target > 0
            ? "partially_refunded"
            : "paid"
      : verified.transactionStatus === "N"
        ? "failed"
        : "pending";
    return tx.payment.update({
      where: { id: p.id },
      data: {
        credited,
        status,
        reversedCoins: Math.max(p.reversedCoins, target),
        refundedCents: refundCents,
        disputeCents,
        gatewayStatus: verified.status,
        gatewayVerifiedAt: new Date(),
      },
    });
  });
}

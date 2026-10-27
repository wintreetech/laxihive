import type { Prisma, Payment } from "@prisma/client";
import { assert } from "../config/database.js";
import { walletChange } from "../../shared/rules.js";
export async function ledger(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  kind: string,
  reference: string,
  description: string,
  allowDebt = false,
) {
  const existing = await tx.walletTransaction.findUnique({
    where: { reference },
  });
  if (existing) return existing;
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
  if (amount < 0 && !allowDebt)
    assert(
      wallet.debt === 0 && wallet.balance >= -amount,
      409,
      "Your wallet does not have enough available coins.",
    );
  const change = walletChange(wallet.balance, wallet.debt, amount);
  await tx.wallet.update({ where: { id: wallet.id }, data: change });
  return tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      amount,
      balanceAfter: change.balance,
      debtAfter: change.debt,
      kind,
      reference,
      description,
    },
  });
}
// All providers and reviewed settlements share the same exactly-once wallet operation.
export async function fulfillCoinPurchase(
  tx: Prisma.TransactionClient,
  payment: Payment,
  source: "GATEWAY" | "MANUAL_SETTLEMENT",
) {
  if (payment.credited) return;
  await ledger(
    tx,
    payment.userId,
    payment.coins,
    "purchased",
    payment.provider === "transactworld"
      ? `payment:transactworld:${payment.id}`
      : `payment:${payment.id}`,
    `${source === "MANUAL_SETTLEMENT" ? "Reviewed settlement" : "Verified payment"} ${payment.currency.toUpperCase()} ${(payment.cents / 100).toFixed(2)}`,
  );
  await tx.purchase.upsert({
    where: { paymentId: payment.id },
    update: {},
    create: { paymentId: payment.id },
  });
  await tx.payment.update({
    where: { id: payment.id },
    data: {
      credited: true,
      status: "paid",
      fulfillmentSource: source,
      ...(source === "MANUAL_SETTLEMENT"
        ? { manuallyVerifiedAt: new Date() }
        : {}),
    },
  });
}

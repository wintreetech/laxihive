import type { Prisma } from "@prisma/client";
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

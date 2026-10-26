import { db } from "../config/database.js";
import {
  gatewayConfig,
  gatewayReady,
  reconcileTransactworld,
} from "../services/transactworld.service.js";
try {
  if (!gatewayReady(gatewayConfig()) || !gatewayConfig().authToken)
    throw new Error(
      "Configure Transactworld credentials and TW_AUTH_TOKEN before reconciliation.",
    );
  const payments = await db.payment.findMany({
    where: {
      provider: "transactworld",
      intentId: { not: null },
      status: {
        in: ["pending", "abandoned", "paid", "partially_refunded", "disputed"],
      },
      createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
    },
    orderBy: { gatewayVerifiedAt: "asc" },
    take: 100,
  });
  let failed = 0;
  for (const payment of payments)
    try {
      const result = await reconcileTransactworld(payment);
      console.log(
        JSON.stringify({ paymentId: payment.id, status: result.status }),
      );
    } catch {
      failed++;
      console.error(
        JSON.stringify({
          paymentId: payment.id,
          status: "verification_unavailable",
        }),
      );
    }
  if (failed) process.exitCode = 1;
} catch (e: any) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

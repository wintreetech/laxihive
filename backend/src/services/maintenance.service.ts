import { db } from "../config/database.js";
import {
  gatewayConfig,
  gatewayReady,
  reconcileTransactworld,
} from "./transactworld.service.js";
import {
  refundUnstartedSessions,
  expireGameSessions,
} from "./game-access.service.js";
let running = false;
export async function maintenanceTick() {
  if (running) return;
  running = true;
  try {
    await refundUnstartedSessions();
    await expireGameSessions();
    // Abandoned is a local display state, never payment proof. Late verified captures still settle normally.
    await db.payment.updateMany({
      where: {
        provider: "transactworld",
        status: "pending",
        OR: [{ intentId: null }, { intentId: { isSet: false } }],
        createdAt: { lt: new Date(Date.now() - 86400000) },
      },
      data: { status: "abandoned" },
    });
    const c = gatewayConfig();
    if (
      process.env.PAYMENT_RECONCILIATION_ENABLED === "false" ||
      !c.authToken ||
      !gatewayReady(c)
    )
      return;
    const orders = await db.payment.findMany({
      where: {
        provider: "transactworld",
        intentId: { not: null },
        status: {
          in: [
            "pending",
            "abandoned",
            "paid",
            "partially_refunded",
            "disputed",
          ],
        },
        createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
      orderBy: { gatewayVerifiedAt: "asc" },
      take: 100,
    });
    for (const p of orders)
      try {
        await reconcileTransactworld(p);
      } catch {
        console.error(
          JSON.stringify({
            event: "payment_verification_unavailable",
            paymentId: p.id,
          }),
        );
      }
  } finally {
    running = false;
  }
}
export function startMaintenance(seconds: number) {
  const run = () =>
    maintenanceTick().catch(() =>
      console.error("Maintenance unavailable; retrying on the next interval."),
    );
  const timer = setInterval(run, seconds * 1000);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}

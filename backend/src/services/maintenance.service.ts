import { db } from "../config/database.js";
import {
  gatewayConfig,
  gatewayReady,
  gatewayInquiryAvailable,
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
  let verified = 0,
    failures = 0;
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
      !gatewayInquiryAvailable(c) ||
      !gatewayReady(c)
    )
      return { verified, failures, verificationConfigured: false };
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
        verified++;
      } catch {
        failures++;
        console.error(
          JSON.stringify({
            event: "payment_verification_unavailable",
            paymentId: p.id,
          }),
        );
      }
    return { verified, failures, verificationConfigured: true };
  } finally {
    running = false;
  }
}
export function startMaintenance(seconds: number) {
  if (process.env.PAYMENT_MAINTENANCE_MODE === "scheduled") return () => {};
  const run = () =>
    maintenanceTick().catch(() =>
      console.error("Maintenance unavailable; retrying on the next interval."),
    );
  const timer = setInterval(run, seconds * 1000);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}

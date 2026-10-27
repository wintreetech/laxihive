import { db } from "../config/database.js";
import { baseMinorUnits } from "../../shared/money.js";
import { fxSettings } from "./fx.service.js";
export async function settlementRevenueReport(from: Date, to: Date) {
  const base = fxSettings().base.toLowerCase();
  const sources = new Map<
    string,
    { currency: string; source: string; orders: number; cents: number }
  >();
  let totalBase = 0,
    convertedOrders = 0,
    missingFxOrders = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.payment.findMany({
      where: { credited: true, createdAt: { gte: from, lt: to } },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        cents: true,
        currency: true,
        refundedCents: true,
        disputeCents: true,
        fulfillmentSource: true,
        baseCurrency: true,
        baseCents: true,
        fxRate: true,
        fxDate: true,
      },
    });
    for (const p of rows) {
      const net = Math.max(
        0,
        p.cents - Math.min(p.cents, p.refundedCents + p.disputeCents),
      );
      const source = p.fulfillmentSource || "LEGACY_GATEWAY";
      const key = `${p.currency}:${source}`,
        row = sources.get(key) || {
          currency: p.currency,
          source,
          orders: 0,
          cents: 0,
        };
      row.orders++;
      row.cents += net;
      sources.set(key, row);
      if (p.currency === base) {
        totalBase += net;
        convertedOrders++;
      } else if (
        p.baseCurrency === base &&
        p.fxRate &&
        p.fxDate &&
        p.baseCents !== null
      ) {
        totalBase += baseMinorUnits(net, p.fxRate);
        convertedOrders++;
      } else missingFxOrders++;
    }
    if (rows.length < 500) break;
    cursor = rows.at(-1)!.id;
  }
  return {
    baseCurrency: base,
    netBaseCents: totalBase,
    convertedOrders,
    missingFxOrders,
    sources: [...sources.values()],
    from,
    to,
    note: "Orders are filtered by creation time in UTC. Net values subtract capped known reversals. Conversion uses only the rate recorded with each order; historical orders without a rate remain unconverted.",
  };
}
export async function verifiedRevenueTotals() {
  const result = await db.$runCommandRaw({
    aggregate: "Payment",
    pipeline: [
      { $match: { credited: true } },
      {
        $project: {
          currency: 1,
          cents: 1,
          net: {
            $subtract: [
              "$cents",
              {
                $min: [
                  "$cents",
                  {
                    $add: [
                      { $ifNull: ["$refundedCents", 0] },
                      { $ifNull: ["$disputeCents", 0] },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$currency",
          cents: { $sum: "$net" },
          grossCents: { $sum: "$cents" },
          orders: { $sum: 1 },
        },
      },
    ],
    cursor: {},
  });
  return ((result as any).cursor?.firstBatch ?? []).map((r: any) => ({
    currency: r._id,
    cents: r.cents,
    grossCents: r.grossCents,
    orders: r.orders,
  }));
}

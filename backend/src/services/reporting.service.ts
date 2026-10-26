import { db } from "../config/database.js";
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

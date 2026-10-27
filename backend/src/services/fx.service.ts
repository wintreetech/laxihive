import { z } from "zod";
import { db, HttpError } from "../config/database.js";
import { decimalRatio } from "../../shared/money.js";
const currency = z
  .string()
  .transform((v) => v.toUpperCase())
  .pipe(z.enum(["EUR", "USD"]));
export const fxObservationSchema = z.object({
  date: z.iso.date(),
  base: currency,
  quote: currency,
  rate: z.number().positive().max(1000),
});
export function fxSettings(env = process.env) {
  return {
    base: (env.COIN_BASE_CURRENCY || "EUR").toUpperCase(),
    provider: env.FX_PROVIDER || "FRANKFURTER_ECB",
    ttl: Number(env.FX_RATE_CACHE_TTL_SECONDS || 3600) * 1000,
    maxAge: Number(env.FX_MAX_RATE_AGE_SECONDS || 604800) * 1000,
  };
}
export async function loadFxRate(
  base: string,
  quote: string,
  options: {
    now?: number;
    fetcher?: typeof fetch;
    cache?: any;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const settings = fxSettings(options.env),
    now = options.now ?? Date.now(),
    cache = options.cache ?? db.fxRate;
  if (
    !["EUR", "USD"].includes(base) ||
    !["EUR", "USD"].includes(quote) ||
    settings.provider !== "FRANKFURTER_ECB"
  )
    throw new HttpError(
      503,
      "Configure the supported ECB exchange-rate provider and EUR/USD base currency.",
    );
  if (base === quote)
    return {
      base,
      quote,
      rate: "1",
      asOf: new Date(now),
      fetchedAt: new Date(now),
      provider: "BASE_CURRENCY",
    };
  const id = `FRANKFURTER_ECB:${base}:${quote}`;
  const previous = await cache.findUnique({ where: { id } });
  const fresh = (row: any) => {
    if (
      !row ||
      row.base !== base ||
      row.quote !== quote ||
      row.provider !== "FRANKFURTER_ECB"
    )
      return false;
    try {
      decimalRatio(row.rate);
    } catch {
      return false;
    }
    return (
      new Date(row.asOf).getTime() <= now &&
      now - new Date(row.asOf).getTime() <= settings.maxAge &&
      new Date(row.fetchedAt).getTime() <= now
    );
  };
  if (
    fresh(previous) &&
    now - new Date(previous.fetchedAt).getTime() <= settings.ttl
  )
    return previous;
  try {
    const response = await (options.fetcher ?? fetch)(
      `https://api.frankfurter.dev/v2/providers/ecb/rate/${base.toLowerCase()}/${quote.toLowerCase()}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) throw new Error("FX provider response failed");
    const observation = fxObservationSchema.parse(await response.json());
    if (observation.base !== base || observation.quote !== quote)
      throw new Error("FX pair mismatch");
    const record = {
      id,
      base,
      quote,
      rate: String(observation.rate),
      asOf: new Date(observation.date + "T00:00:00.000Z"),
      fetchedAt: new Date(now),
      provider: "FRANKFURTER_ECB",
    };
    decimalRatio(record.rate);
    if (!fresh(record)) throw new Error("Stale FX observation");
    await cache.upsert({ where: { id }, create: record, update: record });
    return record;
  } catch {
    if (fresh(previous)) {
      console.warn(
        JSON.stringify({
          event: "fx_provider_unavailable_using_valid_cache",
          base,
          quote,
          asOf: previous.asOf,
        }),
      );
      return previous;
    }
    throw new HttpError(
      503,
      "A current exchange rate is unavailable. Choose the base currency or try again later.",
    );
  }
}

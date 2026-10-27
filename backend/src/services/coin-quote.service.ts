import type { CoinPricingConfig } from "@prisma/client";
import { quoteCoins, type PurchaseCurrency } from "../../shared/rules.js";
import { baseMinorUnits, fxCoinAmount } from "../../shared/money.js";
import { fxSettings, loadFxRate } from "./fx.service.js";
export async function quoteCoinPricing(
  cents: number,
  currency: PurchaseCurrency,
  pricing: CoinPricingConfig,
) {
  const base = fxSettings().base;
  const converted = pricing.pricingPolicy === "FX_BASED";
  quoteCoins(
    cents,
    { ...pricing, coinsPerDollar: 100, coinsPerEuro: 100 },
    currency,
  );
  let fx: any = null;
  if (currency === base || converted || process.env.FX_PROVIDER) {
    try {
      fx = await loadFxRate(base, currency);
    } catch (error) {
      if (converted) throw error;
    }
  }
  const coins = converted
    ? fxCoinAmount(
        cents,
        base === "EUR" ? pricing.coinsPerEuro : pricing.coinsPerDollar,
        fx.rate,
      )
    : quoteCoins(cents, pricing, currency);
  return {
    coins,
    pricingPolicy: pricing.pricingPolicy,
    baseCurrency: fx ? base.toLowerCase() : null,
    baseCents: fx ? baseMinorUnits(cents, fx.rate) : null,
    fxRate: fx?.rate ?? null,
    fxDate: fx?.asOf ?? null,
    fxProvider: fx?.provider ?? null,
  };
}
export const quoteSnapshot = (quote: any) => ({
  baseCurrency: quote.baseCurrency,
  baseCents: quote.baseCents,
  fxRate: quote.fxRate,
  fxDate: quote.fxDate,
  fxProvider: quote.fxProvider,
  pricingPolicy: quote.pricingPolicy,
});

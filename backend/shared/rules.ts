export const XP_PER_WIN = 40;
export const DAILY_REWARD_LIMIT = 20;
export const LEVEL_XP = 400;
export const purchaseCurrencies = ["USD", "EUR"] as const;
export type PurchaseCurrency = (typeof purchaseCurrencies)[number];
export type Pricing = {
  minCents: number;
  maxCents: number;
  stepCents: number;
  coinsPerDollar: number;
  coinsPerEuro?: number;
  enabled: boolean;
  version: number;
};
export function quoteCoins(
  cents: number,
  p: Pricing,
  currency: PurchaseCurrency = "USD",
) {
  if (
    !p.enabled ||
    !Number.isSafeInteger(cents) ||
    cents < p.minCents ||
    cents > p.maxCents ||
    (cents - p.minCents) % p.stepCents !== 0
  )
    throw new Error("Choose an available purchase amount.");
  if (!purchaseCurrencies.includes(currency))
    throw new Error("Choose USD or EUR.");
  const rate = currency === "EUR" ? (p.coinsPerEuro ?? 0) : p.coinsPerDollar;
  const coins = (cents * rate) / 100;
  if (!Number.isSafeInteger(coins) || coins <= 0)
    throw new Error("Pricing must produce whole coins.");
  return coins;
}
export function nextStreak(
  last: Date | null,
  current: number,
  now = new Date(),
) {
  const today = now.toISOString().slice(0, 10),
    prev = last?.toISOString().slice(0, 10);
  if (prev === today) return current;
  const yesterday = new Date(now.getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
  return prev === yesterday ? current + 1 : 1;
}
export function walletChange(balance: number, debt: number, amount: number) {
  if (
    ![balance, debt, amount].every(Number.isSafeInteger) ||
    balance < 0 ||
    debt < 0
  )
    throw new Error("Invalid wallet amounts");
  if (amount >= 0) {
    const offset = Math.min(debt, amount);
    return { balance: balance + amount - offset, debt: debt - offset };
  }
  const debit = -amount;
  return {
    balance: Math.max(0, balance - debit),
    debt: debt + Math.max(0, debit - balance),
  };
}

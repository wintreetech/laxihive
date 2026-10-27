export function decimalRatio(rate: string) {
  if (!/^\d+(?:\.\d{1,12})?$/.test(rate))
    throw new Error("Invalid decimal exchange rate.");
  const [whole, fraction = ""] = rate.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole + fraction);
  if (numerator <= 0n) throw new Error("Exchange rate must be positive.");
  return { numerator, denominator };
}
export function baseMinorUnits(cents: number, rate: string) {
  if (!Number.isSafeInteger(cents) || cents < 0)
    throw new Error("Invalid monetary amount.");
  const { numerator, denominator } = decimalRatio(rate);
  const value = Number(
    (BigInt(cents) * denominator + numerator / 2n) / numerator,
  );
  if (!Number.isSafeInteger(value))
    throw new Error("Monetary amount is too large.");
  return value;
}
export function fxCoinAmount(
  cents: number,
  coinsPerBase: number,
  rate: string,
) {
  if (
    !Number.isSafeInteger(cents) ||
    cents <= 0 ||
    !Number.isSafeInteger(coinsPerBase) ||
    coinsPerBase <= 0
  )
    throw new Error("Invalid coin quote.");
  const { numerator, denominator } = decimalRatio(rate);
  // Round the final virtual-coin amount down once, without floating-point arithmetic.
  const coins = Number(
    (BigInt(cents) * BigInt(coinsPerBase) * denominator) / (100n * numerator),
  );
  if (!Number.isSafeInteger(coins) || coins <= 0)
    throw new Error("Pricing must produce whole coins.");
  return coins;
}

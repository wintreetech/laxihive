export const accessTypes = [
  "FREE_FULL",
  "FREE_TRIAL_THEN_PAID",
  "PAID_FROM_START",
  "PERMANENT_UNLOCK",
  "PREMIUM_SESSION",
] as const;
export type AccessType = (typeof accessTypes)[number];
export type GameAccess = {
  accessType: AccessType;
  coinPrice: number;
  trialSeconds: number;
  sessionSeconds: number;
  active: boolean;
  version: number;
};
// Review proposals only. Seeding never publishes these prices.
export const accessProposals: Record<
  string,
  { accessType: AccessType; coinPrice: number; reason: string }
> = {
  "hive-quest": {
    accessType: "FREE_TRIAL_THEN_PAID",
    coinPrice: 50,
    reason: "Preview a campaign board; purchase one fresh attempt.",
  },
  "orbit-recall": {
    accessType: "FREE_TRIAL_THEN_PAID",
    coinPrice: 50,
    reason: "Growing memory sequence supports a meaningful preview.",
  },
  "number-rush": {
    accessType: "FREE_FULL",
    coinPrice: 0,
    reason: "Keep a quick, fully free discovery game.",
  },
  "daily-hive": {
    accessType: "FREE_FULL",
    coinPrice: 0,
    reason: "Keep the daily habit free.",
  },
  "word-scramble": {
    accessType: "PAID_FROM_START",
    coinPrice: 25,
    reason: "A single short puzzle can finish within 30 seconds.",
  },
  "word-guess": {
    accessType: "FREE_TRIAL_THEN_PAID",
    coinPrice: 50,
    reason: "Multi-guess puzzle; preview restarts into a full attempt.",
  },
  "memory-match": {
    accessType: "FREE_TRIAL_THEN_PAID",
    coinPrice: 50,
    reason: "A full matching board supports a preview.",
  },
  "word-search": {
    accessType: "FREE_TRIAL_THEN_PAID",
    coinPrice: 25,
    reason: "Small word grid; entry-level session.",
  },
  "letter-rescue": {
    accessType: "PAID_FROM_START",
    coinPrice: 25,
    reason: "Short single-word challenge.",
  },
  "word-ladder": {
    accessType: "FREE_TRIAL_THEN_PAID",
    coinPrice: 50,
    reason: "A multi-step puzzle suitable for a preview.",
  },
  "missing-letters": {
    accessType: "PAID_FROM_START",
    coinPrice: 25,
    reason: "Short puzzle; a 30-second trial may reveal the whole answer.",
  },
  "synonym-match": {
    accessType: "PAID_FROM_START",
    coinPrice: 25,
    reason: "Four pairs form a short complete session.",
  },
  "odd-one-out": {
    accessType: "PAID_FROM_START",
    coinPrice: 25,
    reason: "Five short questions.",
  },
  "category-shuffle": {
    accessType: "FREE_TRIAL_THEN_PAID",
    coinPrice: 50,
    reason: "Four groups allow exploration before buying a fresh attempt.",
  },
  "number-trail": {
    accessType: "FREE_FULL",
    coinPrice: 0,
    reason: "Keep free while its mechanics overlap Number Rush.",
  },
  "code-breaker": {
    accessType: "FREE_TRIAL_THEN_PAID",
    coinPrice: 75,
    reason: "Longer deduction challenge.",
  },
  "word-blitz": {
    accessType: "PREMIUM_SESSION",
    coinPrice: 75,
    reason: "A complete 90-second timed challenge; show price before starting.",
  },
  "sequence-surge": {
    accessType: "PAID_FROM_START",
    coinPrice: 50,
    reason: "Five short pattern questions.",
  },
  "hive-lock": {
    accessType: "FREE_TRIAL_THEN_PAID",
    coinPrice: 75,
    reason: "Spatial puzzle with a meaningful preview.",
  },
  "slide-rush": {
    accessType: "FREE_TRIAL_THEN_PAID",
    coinPrice: 100,
    reason: "Longer spatial puzzle; extended tier for review.",
  },
};
export function accessLabel(
  access?: Pick<GameAccess, "accessType" | "coinPrice" | "trialSeconds">,
) {
  if (!access || access.accessType === "FREE_FULL") return "Free to play";
  if (access.accessType === "PERMANENT_UNLOCK")
    return `${access.coinPrice} coins · permanent unlock`;
  if (access.accessType === "FREE_TRIAL_THEN_PAID")
    return `${access.trialSeconds}s free preview · ${access.coinPrice} coins / session`;
  return `${access.coinPrice} coins / session`;
}

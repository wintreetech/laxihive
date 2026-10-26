import { PrismaClient } from "@prisma/client";
import { games, achievements, expansionSlugs } from "../shared/catalog.js";
import { accessProposals } from "../shared/access.js";
import { timeLimit } from "../shared/engine.js";
const db = new PrismaClient();
try {
  for (const g of games)
    await db.game.upsert({
      where: { slug: g.slug },
      update: { name: g.name, category: g.category },
      create: { slug: g.slug, name: g.name, category: g.category },
    });
  for (const a of achievements)
    await db.achievement.upsert({
      where: { slug: a.slug },
      update: { name: a.name, description: a.description },
      create: { slug: a.slug, name: a.name, description: a.description },
    });
  await db.coinPricingConfig.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      coinsPerDollar: 100,
      coinsPerEuro: 100,
      enabled: true,
    },
  });
  for (const slug of expansionSlugs)
    await db.gameUnlock.upsert({
      where: { gameSlug: slug },
      update: {},
      create: {
        gameSlug: slug,
        name: `${games.find((g) => g.slug === slug)!.name}: After Hours`,
        price: 500,
      },
    });
  for (const g of games) {
    const proposal = accessProposals[g.slug];
    await db.gameAccessConfig.upsert({
      where: { id: `${g.slug}:starter` },
      update: {},
      create: {
        id: `${g.slug}:starter`,
        gameSlug: g.slug,
        mode: "starter",
        sessionSeconds: timeLimit(g.slug),
        draft: {
          accessType: proposal.accessType,
          coinPrice: proposal.coinPrice,
          trialSeconds: 30,
          sessionSeconds: timeLimit(g.slug),
          active: true,
        },
      },
    });
  }
  await db.siteSettings.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });
  // Role assignment is an explicit operator action: npm run admin:provision.
  console.log(
    "Seeded 20 games, 6 achievements and 5 optional expansions. Existing pricing was preserved; new stores start at 100 coins per USD or EUR.",
  );
} finally {
  await db.$disconnect();
}

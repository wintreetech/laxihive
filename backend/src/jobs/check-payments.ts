import { db } from "../config/database.js";
import {
  gatewayConfig,
  gatewaySetupIssues,
  gatewayCurrencies,
} from "../services/transactworld.service.js";

try {
  const provider = process.env.PAYMENT_PROVIDER || "transactworld";
  if (provider !== "transactworld")
    throw new Error(
      "Select PAYMENT_PROVIDER=transactworld before checking this gateway.",
    );
  const config = gatewayConfig();
  const issues = gatewaySetupIssues(config);
  if (process.env.PAYMENTS_ENABLED !== "true")
    issues.push("Set PAYMENTS_ENABLED=true when ready to accept payments.");
  const pricing = await db.coinPricingConfig.findUnique({
    where: { id: "global" },
  });
  if (!pricing?.coinsPerDollar || pricing.coinsPerDollar <= 0)
    issues.push(
      "Store coin rate is unset. Choose coins per USD in Admin > Pricing.",
    );
  if (!pricing?.enabled)
    issues.push("Store pricing is disabled in Admin > Pricing.");
  if (!pricing?.coinsPerEuro || pricing.coinsPerEuro <= 0)
    issues.push(
      "EUR coin rate is unset. Choose coins per EUR in Admin > Pricing.",
    );
  console.log(`Transactworld environment: ${config.environment}`);
  console.log(
    `Configured checkout currencies: ${gatewayCurrencies(config).join(", ")}.`,
  );
  console.log(
    `Hosted card request: paymentType=DB, paymentMode=${config.paymentMode}, paymentBrand=${config.paymentBrand}; account ID omitted.`,
  );
  console.log(
    `Hosted checkout: working-key checksum; inquiry API: ${config.authToken ? "manual token override" : "automatic merchant authentication in production"}.`,
  );
  if (config.allowLocalCheckout)
    console.log(
      "Local browser-return testing is enabled. Server notifications cannot reach localhost; production requires public HTTPS callbacks.",
    );
  console.log(
    `Pricing: ${pricing?.coinsPerDollar || 0} coins/USD, ${pricing?.coinsPerEuro || 0} coins/EUR; ${pricing?.enabled ? "enabled" : "disabled"}.`,
  );
  if (issues.length) {
    console.log("\nCheckout cannot start until these settings are complete:");
    for (const issue of issues) console.log(`- ${issue}`);
    process.exitCode = 1;
  } else {
    console.log(
      "\nLocal checkout settings are complete. Merchant acceptance and enabled DB/card/currency routing must still be verified on the hosted page.",
    );
  }
  console.log(
    "No transaction was submitted. No credentials are printed by this check.",
  );
} catch {
  console.error(
    "Payment setup check failed. Check PAYMENT_PROVIDER, DATABASE_URL and the MongoDB connection in backend/.env.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

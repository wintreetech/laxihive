import { createApp } from "./app.js";
import { db } from "./config/database.js";
import { validateEnvironment } from "./config/environment.js";
import { startMaintenance } from "./services/maintenance.service.js";
const environment = validateEnvironment();
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
  throw new Error(
    "Set SESSION_SECRET to a random value of at least 32 characters.",
  );
if (!process.env.APP_ORIGIN || !process.env.DATABASE_URL)
  throw new Error("Set APP_ORIGIN and DATABASE_URL.");
const frontend = new URL(process.env.APP_ORIGIN);
if (
  !["http:", "https:"].includes(frontend.protocol) ||
  frontend.username ||
  frontend.password ||
  frontend.pathname !== "/" ||
  frontend.search ||
  frontend.hash
)
  throw new Error(
    "APP_ORIGIN must be the frontend origin, for example http://localhost:5174, without a page path.",
  );
process.env.APP_ORIGIN = frontend.origin;
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.SMTP_HOST || !process.env.MAIL_FROM)
)
  throw new Error(
    "Production requires SMTP_HOST and MAIL_FROM for account recovery.",
  );
await db.$connect();
const stopMaintenance = startMaintenance(
  environment.PAYMENT_RECONCILIATION_SECONDS,
);
const server = createApp().listen(
  Number(process.env.PORT || 4000),
  "0.0.0.0",
  () =>
    console.log(
      `LexiHive API ready on http://localhost:${process.env.PORT || 4000} (frontend: ${process.env.APP_ORIGIN})`,
    ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      stopMaintenance();
      await db.$disconnect();
      process.exit(0);
    }),
  );

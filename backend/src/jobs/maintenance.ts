import { db } from "../config/database.js";
import { maintenanceTick } from "../services/maintenance.service.js";
try {
  const result = await maintenanceTick();
  console.log(
    JSON.stringify({ event: "scheduled_maintenance_complete", ...result }),
  );
  if (result?.failures) process.exitCode = 1;
} catch {
  console.error(
    "Scheduled maintenance failed. Check database connectivity and provider configuration; no unverified payments were fulfilled.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

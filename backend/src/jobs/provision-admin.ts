import { db, atomic, assert } from "../config/database.js";
import { z } from "zod";
try {
  const at = process.argv.indexOf("--email");
  const email = z
    .email()
    .parse(
      (at >= 0 ? process.argv[at + 1] : process.env.ADMIN_EMAIL)?.toLowerCase(),
    );
  await atomic(async (tx) => {
    await tx.siteSettings.upsert({
      where: { id: "global" },
      update: { revision: { increment: 1 } },
      create: { id: "global", revision: 1 },
    });
    assert(
      (await tx.user.count({ where: { role: "ADMIN", status: "ACTIVE" } })) ===
        0,
      409,
      "An active administrator already exists. Use Admin > Admin users to manage additional administrators.",
    );
    const user = await tx.user.findUnique({ where: { email } });
    assert(
      user?.verifiedAt && user.status === "ACTIVE",
      400,
      "Register and verify this active account before provisioning it.",
    );
    await tx.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    await tx.adminAuditLog.create({
      data: {
        actorId: user.id,
        action: "admin.bootstrap",
        detail: { method: "local-operator-command" },
      },
    });
  });
  console.log(
    "First administrator provisioned. Sign in with that account's existing password.",
  );
} catch (e: any) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

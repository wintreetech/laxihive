import { z } from "zod";
export function validateEnvironment(env = process.env) {
  const schema = z.object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
    APP_ORIGIN: z.url(),
    SESSION_SECRET: z.string().min(32),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    PAYMENT_PROVIDER: z
      .enum(["transactworld", "stripe"])
      .default("transactworld"),
    TW_ENVIRONMENT: z.enum(["live", "sandbox"]).default("live"),
    TW_GATEWAY_ORIGIN: z
      .enum([
        "",
        "https://secure.transactworld.com",
        "https://sandbox.transactworld.com",
      ])
      .optional(),
    PAYMENT_RECONCILIATION_SECONDS: z.coerce
      .number()
      .int()
      .min(30)
      .max(3600)
      .default(60),
    SUPPORT_EMAIL: z
      .union([z.literal(""), z.email().regex(/@[^@]+\.[^@]+$/)])
      .optional(),
  });
  const result = schema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid environment settings: ${[...new Set(result.error.issues.map((i) => i.path[0]))].join(", ")}. See backend/.env.example.`,
    );
  if (
    result.data.NODE_ENV === "production" &&
    new URL(result.data.APP_ORIGIN).protocol !== "https:"
  )
    throw new Error("APP_ORIGIN must use HTTPS in production.");
  return result.data;
}

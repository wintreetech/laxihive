import { Router } from "express";
import { z } from "zod";
import { db, atomic, assert } from "../config/database.js";
import {
  hashPassword,
  verifyPassword,
  createSession,
  requireAuth,
  cookieName,
  cookieOptions,
  digest,
} from "../middleware/auth.middleware.js";
import { sendToken } from "../services/email.service.js";
import {
  requiresEmailVerification,
  emailDeliveryAvailable,
} from "../config/account-policy.js";
export const auth = Router();
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128);
export const registerSchema = z
  .object({
    displayName: z.string().trim().min(2).max(32),
    email: z
      .email()
      .max(254)
      .transform((e) => e.toLowerCase()),
    password: passwordSchema,
    confirmPassword: z.string(),
    terms: z.literal(true),
    website: z.string().max(0).optional(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"],
  });
export function publicUser(u: any) {
  return {
    id: u.id,
    displayName: u.displayName,
    email: u.email,
    role: u.role,
    status: u.status,
    verified: !!u.verifiedAt,
    emailVerificationRequired: requiresEmailVerification(),
    profile: u.profile,
    wallet: u.wallet
      ? { balance: u.wallet.balance, debt: u.wallet.debt }
      : undefined,
  };
}
auth.post("/register", async (req, res) => {
  const data = registerSchema.parse(req.body);
  assert(
    !(await db.user.findUnique({ where: { email: data.email } })),
    409,
    "This email already has an account. Try signing in.",
  );
  const passwordHash = await hashPassword(data.password);
  const user = await db.user.create({
    data: {
      email: data.email,
      displayName: data.displayName,
      passwordHash,
      profile: { create: {} },
      wallet: { create: {} },
    },
    include: { profile: true, wallet: true },
  });
  const csrf = await createSession(user.id, res);
  if (requiresEmailVerification())
    try {
      await sendToken(user.id, user.email, "verify");
    } catch {
      console.error("Verification email delivery failed");
    }
  res.status(201).json({
    user: publicUser(user),
    csrf,
    message: requiresEmailVerification()
      ? "Account created. Check your email to verify your account."
      : "Account created. Welcome to LexiHive.",
  });
});
auth.post("/login", async (req, res) => {
  const data = z
    .object({
      email: z.email().transform((e) => e.toLowerCase()),
      password: z.string().max(128),
    })
    .parse(req.body);
  const user = await db.user.findUnique({
    where: { email: data.email },
    include: { profile: true, wallet: true },
  });
  const valid = await verifyPassword(
    data.password,
    user?.passwordHash ?? (await hashPassword("invalid-password-timing")),
  );
  assert(user && valid, 401, "The email or password is incorrect.");
  assert(
    user.status !== "SUSPENDED",
    403,
    "This account is suspended. Contact support.",
  );
  if (req.auth) await db.session.deleteMany({ where: { id: req.auth.id } });
  const csrf = await createSession(user.id, res);
  res.json({ user: publicUser(user), csrf });
});
auth.get("/session", async (req, res) => {
  if (!req.auth) {
    res.json({
      user: null,
      csrf: null,
      requireEmailVerification: requiresEmailVerification(),
    });
    return;
  }
  const user = await db.user.findUniqueOrThrow({
    where: { id: req.auth.userId },
    include: { profile: true, wallet: true },
  });
  res.json({
    user: publicUser(user),
    csrf: req.auth.csrf,
    requireEmailVerification: requiresEmailVerification(),
  });
});
auth.post("/logout", requireAuth, async (req, res) => {
  await db.session.deleteMany({ where: { id: req.auth!.id } });
  res.clearCookie(cookieName, cookieOptions());
  res.json({ ok: true });
});
auth.post("/forgot-password", async (req, res) => {
  assert(
    emailDeliveryAvailable(),
    503,
    "Account recovery email is not configured. Contact support for assistance.",
  );
  const { email } = z
    .object({ email: z.email().transform((e) => e.toLowerCase()) })
    .parse(req.body);
  const user = await db.user.findUnique({ where: { email } });
  if (user)
    try {
      await sendToken(user.id, email, "reset");
    } catch {
      console.error("Password reset delivery failed");
    }
  res.json({
    message:
      "If an account exists, a reset link will be sent. Check your inbox.",
  });
});
auth.post("/resend-verification", requireAuth, async (req, res) => {
  assert(
    emailDeliveryAvailable(),
    503,
    "Verification email is not configured. Contact support for assistance.",
  );
  const user = await db.user.findUniqueOrThrow({
    where: { id: req.auth!.userId },
  });
  assert(!user.verifiedAt, 409, "Your email is already verified.");
  const developmentLink = await sendToken(user.id, user.email, "verify");
  const localDevelopment =
    process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(req.hostname) &&
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      req.socket.remoteAddress || "",
    );
  res.set("Cache-Control", "no-store");
  res.json({
    message: developmentLink
      ? "Verification link is ready for local testing."
      : "Verification email sent. Check your inbox.",
    ...(localDevelopment && developmentLink
      ? { developmentVerificationUrl: developmentLink }
      : {}),
  });
});
auth.post("/verify-email", async (req, res) => {
  const { token } = z.object({ token: z.string().length(64) }).parse(req.body);
  await atomic(async (tx) => {
    const t = await tx.authToken.findUnique({ where: { id: digest(token) } });
    assert(
      t && t.kind === "verify" && t.expiresAt > new Date(),
      400,
      "This verification link is invalid or expired.",
    );
    await tx.user.update({
      where: { id: t.userId },
      data: { verifiedAt: new Date() },
    });
    await tx.authToken.deleteMany({
      where: { userId: t.userId, kind: "verify" },
    });
  });
  res.json({ message: "Your email is verified. Welcome to the hive." });
});
auth.post("/reset-password", async (req, res) => {
  const data = z
    .object({ token: z.string().length(64), password: passwordSchema })
    .parse(req.body);
  const passwordHash = await hashPassword(data.password);
  await atomic(async (tx) => {
    const t = await tx.authToken.findUnique({
      where: { id: digest(data.token) },
    });
    assert(
      t && t.kind === "reset" && t.expiresAt > new Date(),
      400,
      "This reset link is invalid or expired.",
    );
    await tx.user.update({ where: { id: t.userId }, data: { passwordHash } });
    await tx.authToken.deleteMany({
      where: { userId: t.userId, kind: "reset" },
    });
    await tx.session.deleteMany({ where: { userId: t.userId } });
  });
  res.clearCookie(cookieName, cookieOptions());
  res.json({ message: "Password updated. Sign in with your new password." });
});

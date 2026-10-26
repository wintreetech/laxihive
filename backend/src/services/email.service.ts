import nodemailer from "nodemailer";
import { db } from "../config/database.js";
import { token, digest } from "../middleware/auth.middleware.js";
export async function sendToken(
  userId: string,
  email: string,
  kind: "verify" | "reset",
) {
  const raw = token();
  const link = `${process.env.APP_ORIGIN}/${kind === "verify" ? "verify-email" : "reset-password"}?token=${raw}`;
  await db.authToken.create({
    data: {
      id: digest(raw),
      userId,
      kind,
      expiresAt: new Date(Date.now() + (kind === "reset" ? 3600000 : 86400000)),
    },
  });
  if (process.env.SMTP_HOST && process.env.MAIL_FROM) {
    await nodemailer
      .createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_PORT === "465",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
          : undefined,
      })
      .sendMail({
        from: process.env.MAIL_FROM,
        to: email,
        subject:
          kind === "verify"
            ? "Welcome to LexiHive — verify your email"
            : "Reset your LexiHive password",
        text: `${kind === "verify" ? "Verify your email" : "Reset your password"}: ${link}\nIf you did not request this, ignore this email.`,
      });
  } else if (process.env.NODE_ENV === "development") {
    console.log(`[development email] ${kind}: ${link}`);
    if (kind === "verify") return link;
  } else if (process.env.NODE_ENV === "test") return;
  else throw new Error("Email provider is not configured");
}

import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response, NextFunction } from "express";
import { db, assert } from "../config/database.js";
const scrypt = promisify(scryptCb);
export const token = () => randomBytes(32).toString("hex");
export const digest = (value: string) =>
  createHmac("sha256", process.env.SESSION_SECRET!).update(value).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(hash, Buffer.from(key, "hex"));
}
declare module "express-serve-static-core" {
  interface Request {
    auth?: {
      userId: string;
      id: string;
      csrf: string;
      role: string;
      verified: boolean;
    };
  }
}
export const cookieName = "lexihive_session";
export const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 1000 * 60 * 60 * 24 * 30,
});
export async function createSession(userId: string, res: Response) {
  const raw = token(),
    csrf = token();
  await db.session.create({
    data: {
      id: digest(raw),
      userId,
      csrf,
      expiresAt: new Date(Date.now() + cookieOptions().maxAge),
    },
  });
  res.cookie(cookieName, raw, cookieOptions());
  return csrf;
}
export async function loadSession(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const raw = req.cookies?.[cookieName];
    if (typeof raw === "string" && raw.length === 64) {
      const s = await db.session.findUnique({
        where: { id: digest(raw) },
        include: {
          user: {
            select: { id: true, role: true, verifiedAt: true, status: true },
          },
        },
      });
      if (s && s.expiresAt > new Date() && s.user.status !== "SUSPENDED")
        req.auth = {
          userId: s.userId,
          id: s.id,
          csrf: s.csrf,
          role: s.user.role,
          verified: !!s.user.verifiedAt,
        };
    }
    next();
  } catch (e) {
    next(e);
  }
}
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    assert(req.auth, 401, "Sign in to continue.");
    next();
  } catch (e) {
    next(e);
  }
}
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    assert(req.auth?.role === "ADMIN", 403, "Administrator access required.");
    next();
  } catch (e) {
    next(e);
  }
}
export function csrf(req: Request, _res: Response, next: NextFunction) {
  try {
    if (["POST", "PATCH", "DELETE", "PUT"].includes(req.method)) {
      assert(
        req.get("origin") === process.env.APP_ORIGIN,
        403,
        process.env.NODE_ENV === "development"
          ? `Request origin is not allowed. Open ${process.env.APP_ORIGIN} or update APP_ORIGIN in backend/.env to match your frontend address.`
          : "Request origin is not allowed.",
      );
      if (req.auth)
        assert(
          req.get("x-csrf-token") === req.auth.csrf,
          403,
          "Session security token expired. Refresh and try again.",
        );
    }
    next();
  } catch (e) {
    next(e);
  }
}

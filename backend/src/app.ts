import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { ZodError } from "zod";
import type Stripe from "stripe";
import { db, HttpError } from "./config/database.js";
import { auth } from "./routes/auth.routes.js";
import {
  loadSession,
  requireAuth,
  requireAdmin,
  csrf,
} from "./middleware/auth.middleware.js";
import { gameRoutes, leaderboard } from "./routes/game.routes.js";
import { me } from "./routes/profile.routes.js";
import { paymentsRoutes } from "./routes/payment.routes.js";
import { webhook, stripeClient } from "./services/stripe.service.js";
import { admin } from "./routes/admin.routes.js";
import {
  transactworldCallback,
  transactworldReturn,
} from "./controllers/transactworld.controller.js";
import type { Inquiry } from "./services/transactworld.service.js";
export function createApp(
  options: { stripe?: Stripe | null; transactworldInquiry?: Inquiry } = {},
) {
  const stripe = options.stripe === undefined ? stripeClient() : options.stripe;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.APP_ORIGIN,
      credentials: true,
      allowedHeaders: ["Content-Type", "X-CSRF-Token"],
    }),
  );
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json", limit: "256kb" }),
    webhook(stripe),
  );
  const gatewayLimiter = rateLimit({
    windowMs: 60000,
    limit: 600,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.post(
    ["/api/payments/forward/:orderItemId", "/api/pricing/forward/:orderItemId"],
    gatewayLimiter,
    express.json({ limit: "64kb" }),
    express.urlencoded({ extended: false, limit: "64kb" }),
    transactworldCallback(options.transactworldInquiry),
  );
  app.all(
    "/api/payments/transactworld/return/:orderItemId",
    express.urlencoded({ extended: false, limit: "64kb" }),
    transactworldReturn,
  );
  app.use(express.json({ limit: "256kb" }), cookieParser());
  app.get("/api/health", async (_req, res) => {
    await db.$runCommandRaw({ ping: 1 });
    res.json({ status: "ok", service: "lexihive-backend" });
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 240,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    loadSession,
    csrf,
  );
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 15 * 60000,
      limit: process.env.NODE_ENV === "test" ? 500 : 30,
      skip: (req) => req.method === "GET",
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    auth,
  );
  app.use("/api/games", gameRoutes);
  app.get("/api/site", async (_req, res) => {
    const settings = await db.siteSettings.findUnique({
      where: { id: "global" },
    });
    const supportEmail =
      settings?.supportEmail || process.env.SUPPORT_EMAIL || "";
    res.json({
      supportEmail: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(supportEmail)
        ? supportEmail
        : "",
      supportReplyAim: settings?.supportReplyAim ?? false,
    });
  });
  app.use("/api/me", requireAuth, me);
  app.get("/api/leaderboards", async (req, res) =>
    res.json(
      await leaderboard(
        typeof req.query.game === "string" && req.query.game !== "all"
          ? req.query.game
          : undefined,
        req.query.period === "weekly",
      ),
    ),
  );
  app.use("/api", paymentsRoutes(stripe));
  app.use("/api/admin", requireAuth, requireAdmin, admin);
  app.use("/api", (_req, res) =>
    res.status(404).json({ message: "This API route does not exist." }),
  );
  app.use(
    (
      err: any,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof ZodError) {
        res.status(400).json({
          message: err.issues[0]?.message || "Check your input.",
          issues: err.issues,
        });
        return;
      }
      const status =
        err instanceof HttpError
          ? err.status
          : err.code === "P2002"
            ? 409
            : err.type === "entity.parse.failed"
              ? 400
              : 500;
      if (status === 500)
        console.error(
          JSON.stringify({
            level: "error",
            method: req.method,
            path: req.path,
            error: err.name,
            code: err.code,
          }),
        );
      res.status(status).json({
        message:
          status === 500
            ? "Something went wrong. Please try again."
            : err.code === "P2002"
              ? "This record already exists."
              : err.message,
      });
    },
  );
  return app;
}

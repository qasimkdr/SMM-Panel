import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { env } from "./env";
import { logger } from "./lib/logger";
import { pool } from "./lib/db";
import { redis } from "./lib/redis";
import { notFound } from "./lib/errors";
import { authenticate, sameOrigin } from "./middleware/auth";
import { rateLimit } from "./middleware/rateLimit";
import { errorHandler } from "./middleware/error";
import { authRouter } from "./routes/auth";
import { meRouter } from "./routes/me";
import { publicRouter } from "./routes/public";
import { adminRouter } from "./routes/admin";
import { ordersRouter } from "./routes/orders";
import { v2Router } from "./routes/v2";
import { notificationsRouter, ticketsRouter } from "./routes/support";
import { securityRouter } from "./routes/security";
import { affiliatesRouter, childPanelsRouter, couponsRouter } from "./routes/growth";

export function createApp() {
  const app = express();
  app.set("trust proxy", env.TRUST_PROXY.split(",").map((s) => s.trim()));
  app.disable("x-powered-by");
  app.set("etag", "strong"); // conditional GETs → 304s instead of full payloads

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: false, limit: "256kb" })); // API v2 clients send form data
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/api/health" },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "debug"),
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/api/ready", async (_req, res) => {
    await Promise.all([pool.query("SELECT 1"), redis.ping()]);
    res.json({ ok: true });
  });

  // Reseller API v2: key-based auth, its own limits, no cookies/CSRF involved.
  app.use("/api/v2", v2Router);

  const api = express.Router();
  api.use(sameOrigin);
  api.use(authenticate);
  api.use(rateLimit({ name: "global", limit: 300, windowSec: 60, key: (r) => r.auth?.sub ?? r.ip ?? "anon" }));
  api.use("/auth", authRouter);
  api.use("/me", meRouter);
  api.use("/orders", ordersRouter);
  api.use("/tickets", ticketsRouter);
  api.use("/notifications", notificationsRouter);
  api.use("/security", securityRouter);
  api.use("/affiliates", affiliatesRouter);
  api.use("/coupons", couponsRouter);
  api.use("/child-panels", childPanelsRouter);
  api.use("/admin", adminRouter);
  api.use("/", publicRouter);
  api.use(() => {
    throw notFound("Endpoint not found");
  });

  app.use("/api", api);
  app.use(errorHandler);
  return app;
}

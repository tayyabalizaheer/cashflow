import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { env, isProduction } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { financeRouter, publicFinanceRouter } from "./routes/finance.js";
import { healthRouter } from "./routes/health.js";
import { profileRouter } from "./routes/profile.js";
import { syncRouter } from "./routes/sync.js";
import { errorHandler } from "./utils/errors.js";
import { openApiDocument } from "./openapi.js";

function isAllowedCorsOrigin(origin: string | undefined) {
  if (!origin) {
    return true;
  }

  const configuredOrigins = env.WEB_ORIGIN.split(",").map((value) => value.trim());
  if (configuredOrigins.includes(origin)) {
    return true;
  }

  if (!isProduction) {
    try {
      const url = new URL(origin);
      return ["localhost", "127.0.0.1"].includes(url.hostname);
    } catch {
      return false;
    }
  }

  return false;
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:"],
              connectSrc: ["'self'", ...env.WEB_ORIGIN.split(",").map((value) => value.trim())]
            }
          }
        : false
    })
  );
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, isAllowedCorsOrigin(origin));
      },
      credentials: true
    })
  );
  app.use(compression());
  app.use(express.json({ limit: "512kb" }));
  app.use(cookieParser(env.COOKIE_SECRET));
  app.use(morgan(isProduction ? "combined" : "dev"));

  app.use(
    "/api/v1/auth",
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false }),
    authRouter
  );
  app.use("/api/v1", healthRouter);
  app.use("/api/v1/profile", profileRouter);
  app.use("/api/v1/sync", syncRouter);
  app.use("/api/v1", publicFinanceRouter);
  app.use("/api/v1", financeRouter);
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
  app.use(errorHandler);

  return app;
}

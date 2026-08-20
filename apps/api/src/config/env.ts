import { config } from "dotenv";
import { z } from "zod";
import { ensureDatabaseUrl } from "./database-url.js";

config();
config({ path: "../../.env" });
ensureDatabaseUrl();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  DATABASE_HOST: z.string().min(1).default("localhost"),
  DATABASE_PORT: z.coerce.number().int().positive().default(3306),
  DATABASE_USERNAME: z.string().min(1).default("cashflow"),
  DATABASE_PASSWORD: z.string().default("cashflow"),
  DATABASE_NAME: z.string().min(1).default("cashflow"),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  FRONTEND_DIST_DIR: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  JWT_ACCESS_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  REMEMBER_ME_REFRESH_TOKEN_TTL_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(90),
  AL_MEEZAN_FUND_PRICE_SCRAPER_ENABLED: z
    .string()
    .default("true")
    .transform((value) => value.toLowerCase() === "true"),
  AL_MEEZAN_FUND_PRICE_CRON: z.string().default("0 5 * * *"),
  AL_MEEZAN_FUND_PRICE_TIMEZONE: z.string().default("Asia/Karachi"),
});

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === "production";

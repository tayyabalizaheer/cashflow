import { config } from "dotenv";
import { z } from "zod";

config();
config({ path: "../../.env" });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  JWT_ACCESS_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  REMEMBER_ME_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(90)
});

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === "production";

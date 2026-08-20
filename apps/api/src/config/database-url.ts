import { z } from "zod";

const databasePartsSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DATABASE_HOST: z.string().min(1).default("localhost"),
  DATABASE_PORT: z.coerce.number().int().positive().default(3306),
  DATABASE_USERNAME: z.string().min(1).default("cashflow"),
  DATABASE_PASSWORD: z.string().default("cashflow"),
  DATABASE_NAME: z.string().min(1).default("cashflow")
});

export function buildDatabaseUrl(rawEnv: NodeJS.ProcessEnv = process.env) {
  const env = databasePartsSchema.parse(rawEnv);
  if (env.DATABASE_URL) return env.DATABASE_URL;

  const username = encodeURIComponent(env.DATABASE_USERNAME);
  const password = encodeURIComponent(env.DATABASE_PASSWORD);
  const database = encodeURIComponent(env.DATABASE_NAME);

  return `mysql://${username}:${password}@${env.DATABASE_HOST}:${env.DATABASE_PORT}/${database}`;
}

export function ensureDatabaseUrl() {
  process.env.DATABASE_URL ??= buildDatabaseUrl();
  return process.env.DATABASE_URL;
}

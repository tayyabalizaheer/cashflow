import { spawnSync } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

function value(name, fallback) {
  return process.env[name] ?? fallback;
}

function buildDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const host = value("DATABASE_HOST", "localhost");
  const port = value("DATABASE_PORT", "3306");
  const username = encodeURIComponent(value("DATABASE_USERNAME", "cashflow"));
  const password = encodeURIComponent(value("DATABASE_PASSWORD", "cashflow"));
  const database = encodeURIComponent(value("DATABASE_NAME", "cashflow"));

  return `mysql://${username}:${password}@${host}:${port}/${database}`;
}

process.env.DATABASE_URL = buildDatabaseUrl();

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/with-database-url.mjs <command> [...args]");
  process.exit(1);
}

const result = spawnSync(command, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env
});

process.exit(result.status ?? 1);

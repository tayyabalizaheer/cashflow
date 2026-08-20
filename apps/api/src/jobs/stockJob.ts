import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env.js";
import { scrapeAndSaveStocks } from "../services/stock.js";

let running = false;
let scheduledTask: ScheduledTask | null = null;

async function runStockJob(reason: "startup" | "schedule") {
  if (running) {
    console.log(`Stock scrape skipped (${reason}); previous run is still active.`);
    return;
  }

  running = true;

  try {
    const savedCount = await scrapeAndSaveStocks();
    console.log(`Stock scrape completed (${reason}); ${savedCount} rows saved.`);
  } catch (error) {
    console.error(`Stock scrape failed (${reason}).`, error);
  } finally {
    running = false;
  }
}

export function startStockJob() {
  if (!env.AL_MEEZAN_FUND_PRICE_SCRAPER_ENABLED) {
    console.log("Stock scrape job is disabled.");
    return;
  }

  void runStockJob("startup");

  scheduledTask = cron.schedule(
    env.AL_MEEZAN_FUND_PRICE_CRON,
    () => {
      void runStockJob("schedule");
    },
    {
      timezone: env.AL_MEEZAN_FUND_PRICE_TIMEZONE
    }
  );
}

export function stopStockJob() {
  scheduledTask?.stop();
  scheduledTask?.destroy();
  scheduledTask = null;
}

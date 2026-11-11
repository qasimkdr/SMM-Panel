import { Queue, Worker } from "bullmq";
import { connection, logger, pool } from "./lib";
import { refreshCurrencyRates } from "./jobs/currency-rates";

/**
 * Background workers. Only this process talks to provider APIs (placed in later steps):
 *   orders        – send new orders to providers (retry + backoff)
 *   order-status  – batch status checks, 100 orders per provider call
 *   provider-sync – import/refresh provider services and prices, then reprice
 *   maintenance   – currency rates, VIP recalculation, cleanup
 */
const maintenance = new Queue("maintenance", { connection });

await maintenance.upsertJobScheduler("currency-rates", { pattern: "15 3 * * *" }, { name: "currency-rates" });

const worker = new Worker(
  "maintenance",
  async (job) => {
    switch (job.name) {
      case "currency-rates":
        return refreshCurrencyRates();
      default:
        logger.warn({ name: job.name }, "unknown maintenance job");
    }
  },
  { connection, concurrency: 2 },
);

worker.on("failed", (job, err) => logger.error({ job: job?.name, err: err.message }, "job failed"));
logger.info("worker started");

// Refresh rates once on boot if they were never set (fresh install).
void maintenance.add("currency-rates", {}, { jobId: "boot-currency-rates", removeOnComplete: true, removeOnFail: true });

async function shutdown() {
  await worker.close();
  await maintenance.close();
  await Promise.allSettled([pool.end(), connection.quit()]);
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

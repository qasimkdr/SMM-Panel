import { Queue, Worker, UnrecoverableError } from "bullmq";
import { QUEUES, type ProviderJob } from "@smm/shared";
import { connection, logger, pool } from "./lib";
import { refreshCurrencyRates } from "./jobs/currency-rates";
import { runProviderJob, scheduleDueSyncs } from "./jobs/provider";
import { ProviderError } from "./providers";

/**
 * Background workers. Only this process talks to provider APIs:
 *   provider      – test connection, fetch service lists, sync prices (+ reprice)
 *   maintenance   – currency rates, due-sync scheduling, cleanup
 *   orders / order-status – added in the orders step
 */
const maintenance = new Queue(QUEUES.maintenance, { connection });
const providerQueue = new Queue<ProviderJob>(QUEUES.provider, { connection });

await maintenance.upsertJobScheduler("currency-rates", { pattern: "15 3 * * *" }, { name: "currency-rates" });
await maintenance.upsertJobScheduler("provider-sync-due", { every: 10 * 60_000 }, { name: "provider-sync-due" });

const maintenanceWorker = new Worker(
  QUEUES.maintenance,
  async (job) => {
    switch (job.name) {
      case "currency-rates":
        return refreshCurrencyRates();
      case "provider-sync-due":
        return scheduleDueSyncs((id) =>
          providerQueue.add(
            "sync",
            { kind: "sync", providerId: id },
            // jobId de-duplicates: a provider never has two scheduled syncs queued at once
            { jobId: `sync-${id}-${Math.floor(Date.now() / 600_000)}`, removeOnComplete: 100, removeOnFail: 200, attempts: 2, backoff: { type: "exponential", delay: 30_000 } },
          ),
        );
      default:
        logger.warn({ name: job.name }, "unknown maintenance job");
    }
  },
  { connection, concurrency: 2 },
);

const providerWorker = new Worker<ProviderJob>(
  QUEUES.provider,
  async (job) => {
    try {
      return await runProviderJob(job.data);
    } catch (err) {
      // Bad key / unknown service: don't burn retries.
      if (err instanceof ProviderError && err.permanent) throw new UnrecoverableError(err.message);
      throw err;
    }
  },
  { connection, concurrency: 4 },
);

for (const w of [maintenanceWorker, providerWorker])
  w.on("failed", (job, err) => logger.error({ queue: w.name, job: job?.name, err: err.message }, "job failed"));
logger.info("worker started");

void maintenance.add("currency-rates", {}, { jobId: "boot-currency-rates", removeOnComplete: true, removeOnFail: true });

async function shutdown() {
  await Promise.allSettled([maintenanceWorker.close(), providerWorker.close()]);
  await Promise.allSettled([maintenance.close(), providerQueue.close()]);
  await Promise.allSettled([pool.end(), connection.quit()]);
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

import { Queue, Worker, UnrecoverableError } from "bullmq";
import { QUEUES, type ProviderJob } from "@smm/shared";
import { connection, logger, pool } from "./lib";
import { refreshCurrencyRates } from "./jobs/currency-rates";
import { runProviderJob, scheduleDueSyncs } from "./jobs/provider";
import { ProviderError } from "./providers";
import { pollRefills, pollStatuses, runOrderJob, type OrderJob } from "./jobs/orders";

/**
 * Background workers. Only this process talks to provider APIs:
 *   provider      – test connection, fetch service lists, sync prices (+ reprice)
 *   maintenance   – currency rates, due-sync scheduling, cleanup
 *   orders        – send orders to providers (backup provider fallback), refills, cancels
 *   order-status  – batched status polling (100 per call), refunds, live updates
 */
const maintenance = new Queue(QUEUES.maintenance, { connection });
const providerQueue = new Queue<ProviderJob>(QUEUES.provider, { connection });
const statusQueue = new Queue(QUEUES.orderStatus, { connection });

await maintenance.upsertJobScheduler("currency-rates", { pattern: "15 3 * * *" }, { name: "currency-rates" });
await maintenance.upsertJobScheduler("provider-sync-due", { every: 10 * 60_000 }, { name: "provider-sync-due" });
await statusQueue.upsertJobScheduler("poll-statuses", { every: Number(process.env.STATUS_POLL_MS ?? 60_000) }, { name: "poll-statuses", opts: { removeOnComplete: 10, removeOnFail: 50 } });
await statusQueue.upsertJobScheduler("poll-refills", { every: 5 * 60_000 }, { name: "poll-refills", opts: { removeOnComplete: 10, removeOnFail: 50 } });

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

// Orders: many in parallel (each is one provider HTTP call).
const ordersWorker = new Worker<OrderJob>(QUEUES.orders, (job) => runOrderJob(job), {
  connection,
  concurrency: Number(process.env.ORDER_CONCURRENCY ?? 20),
});

// Status polling: concurrency 1 so polls never overlap.
const statusWorker = new Worker(
  QUEUES.orderStatus,
  async (job) => (job.name === "poll-refills" ? pollRefills() : pollStatuses()),
  { connection, concurrency: 1 },
);

for (const w of [maintenanceWorker, providerWorker, ordersWorker, statusWorker])
  w.on("failed", (job, err) => logger.error({ queue: w.name, job: job?.name, err: err.message }, "job failed"));
logger.info("worker started");

void maintenance.add("currency-rates", {}, { jobId: "boot-currency-rates", removeOnComplete: true, removeOnFail: true });

async function shutdown() {
  await Promise.allSettled([maintenanceWorker.close(), providerWorker.close(), ordersWorker.close(), statusWorker.close()]);
  await Promise.allSettled([maintenance.close(), providerQueue.close(), statusQueue.close()]);
  await Promise.allSettled([pool.end(), connection.quit()]);
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

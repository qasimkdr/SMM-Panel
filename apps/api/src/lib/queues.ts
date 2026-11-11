import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { QUEUES, type ProviderJob } from "@smm/shared";
import { env } from "../env";
import { HttpError } from "./errors";

// BullMQ needs connections with maxRetriesPerRequest: null.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
export const providerQueue = new Queue<ProviderJob>(QUEUES.provider, { connection });
let events: QueueEvents | null = null;

/**
 * The API never calls providers itself. For admin actions that need an answer now
 * (test connection, fetch list) it queues a worker job and waits for the result.
 */
export async function runProviderJob<T>(job: ProviderJob, timeoutMs = 45_000): Promise<T> {
  events ??= new QueueEvents(QUEUES.provider, { connection: connection.duplicate() });
  await events.waitUntilReady();
  const j = await providerQueue.add(job.kind, job, { removeOnComplete: 50, removeOnFail: 50 });
  try {
    return (await j.waitUntilFinished(events, timeoutMs)) as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/timed out/i.test(msg)) throw new HttpError(504, "provider_timeout", "The provider is taking too long. The job keeps running; check back in a minute.");
    throw new HttpError(502, "provider_error", msg);
  }
}

export async function closeQueues() {
  await Promise.allSettled([providerQueue.close(), events?.close()]);
  connection.disconnect();
}

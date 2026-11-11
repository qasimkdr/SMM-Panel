import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { QUEUES, type ProviderJob } from "@smm/shared";

export type OrderJob = { kind: "place"; orderId: number } | { kind: "refill"; refillId: number } | { kind: "cancel"; orderId: number };
import { env } from "../env";
import { HttpError } from "./errors";

// BullMQ needs connections with maxRetriesPerRequest: null.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
export const providerQueue = new Queue<ProviderJob>(QUEUES.provider, { connection });
export const ordersQueue = new Queue<OrderJob>(QUEUES.orders, {
  connection,
  defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 15_000 }, removeOnComplete: 1000, removeOnFail: 5000 },
});
/** Same shape the worker's email sender expects (apps/worker/src/mail.ts). */
export interface EmailJob {
  to: string;
  subject: string;
  title: string;
  lines: string[];
  cta?: { label: string; path: string };
}
export const emailQueue = new Queue<EmailJob>(QUEUES.emails, {
  connection,
  defaultJobOptions: { attempts: 4, backoff: { type: "exponential", delay: 30_000 }, removeOnComplete: 500, removeOnFail: 1000 },
});
export const enqueueEmail = (job: EmailJob) => emailQueue.add(job.subject.slice(0, 40), job).catch(() => null);
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
  await Promise.allSettled([providerQueue.close(), ordersQueue.close(), emailQueue.close(), events?.close()]);
  connection.disconnect();
}

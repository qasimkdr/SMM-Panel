import { env } from "./env";
import { createApp } from "./app";
import { logger } from "./lib/logger";
import { pool } from "./lib/db";
import { redis } from "./lib/redis";
import { closeQueues } from "./lib/queues";
import { closeLive } from "./services/live";

const server = createApp().listen(env.PORT, () => logger.info(`API listening on :${env.PORT}`));
server.keepAliveTimeout = 65_000; // longer than typical proxy idle timeouts
server.headersTimeout = 66_000;

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, "shutting down");
  await closeLive();
  server.close(async () => {
    await Promise.allSettled([pool.end(), redis.quit(), closeQueues()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

import { Redis } from "ioredis";
import pino from "pino";
import { createDb } from "@smm/db";
import { env } from "./env";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(env.isProd ? {} : { transport: { target: "pino-pretty", options: { colorize: true } } }),
});
export const { db, pool } = createDb(env.DATABASE_URL, Number(process.env.WORKER_DB_POOL_SIZE ?? 10));
/** BullMQ requires maxRetriesPerRequest: null on its connection. */
export const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

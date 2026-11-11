import { Redis } from "ioredis";
import { env } from "../env";
import { logger } from "./logger";

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, enableAutoPipelining: true });
redis.on("error", (err) => logger.error({ err }, "redis error"));

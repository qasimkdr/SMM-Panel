import type { NextFunction, Request, Response } from "express";
import { redis } from "../lib/redis";
import { tooMany } from "../lib/errors";

/** Fixed-window limiter in Redis (one round trip via pipeline). Shared across all API instances. */
export function rateLimit(opts: { name: string; limit: number; windowSec: number; key?: (req: Request) => string }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = opts.key ? opts.key(req) : req.ip ?? "unknown";
    const bucket = Math.floor(Date.now() / 1000 / opts.windowSec);
    const key = `rl:${opts.name}:${id}:${bucket}`;
    const [[, count]] = (await redis.multi().incr(key).expire(key, opts.windowSec + 1).exec()) as [[null, number]];
    const remaining = Math.max(0, opts.limit - count);
    res.setHeader("RateLimit-Limit", opts.limit);
    res.setHeader("RateLimit-Remaining", remaining);
    if (count > opts.limit) {
      const retry = opts.windowSec - (Math.floor(Date.now() / 1000) % opts.windowSec);
      res.setHeader("Retry-After", retry);
      throw tooMany(retry);
    }
    next();
  };
}

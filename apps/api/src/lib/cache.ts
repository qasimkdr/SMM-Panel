import { redis } from "./redis";

const inflight = new Map<string, Promise<unknown>>();

/**
 * Cache-aside with single-flight:
 *  - per process: concurrent misses share one promise
 *  - across processes: a short Redis lock so 1,000 simultaneous misses cause one DB query
 */
export async function cached<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
  const hit = await redis.get(key);
  if (hit !== null) return JSON.parse(hit) as T;

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const p = (async () => {
    const lockKey = `lock:${key}`;
    const gotLock = await redis.set(lockKey, "1", "EX", 10, "NX");
    if (!gotLock) {
      // someone else is building it — wait briefly for their result
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const v = await redis.get(key);
        if (v !== null) return JSON.parse(v) as T;
      }
    }
    try {
      const value = await load();
      await redis.set(key, JSON.stringify(value), "EX", ttlSec);
      return value;
    } finally {
      if (gotLock) await redis.del(lockKey);
    }
  })();

  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

export const invalidate = (...keys: string[]) => (keys.length ? redis.del(...keys) : Promise.resolve(0));

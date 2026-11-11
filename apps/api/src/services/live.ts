import type { Response } from "express";
import { Redis } from "ioredis";
import { env } from "../env";
import { logger } from "../lib/logger";

/**
 * Live order updates over Server-Sent Events.
 * One Redis subscriber per API process (pattern subscription), fanned out in memory to that
 * user's open tabs — so 10,000 connected users cost one Redis connection, not 10,000.
 */
const clients = new Map<number, Set<Response>>();
let sub: Redis | null = null;

function ensureSubscriber() {
  if (sub) return;
  sub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  sub.on("error", (err) => logger.error({ err }, "live subscriber error"));
  void sub.psubscribe("orders:user:*");
  sub.on("pmessage", (_pattern, channel, message) => {
    const userId = Number(channel.slice("orders:user:".length));
    const set = clients.get(userId);
    if (!set) return;
    for (const res of set) res.write(`event: order\ndata: ${message}\n\n`);
  });
}

export function openStream(userId: number, res: Response) {
  ensureSubscriber();
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write("retry: 5000\n\n");
  let set = clients.get(userId);
  if (!set) clients.set(userId, (set = new Set()));
  if (set.size >= 10) {
    // Cap tabs per user to protect the server.
    const oldest = set.values().next().value as Response;
    oldest.end();
    set.delete(oldest);
  }
  set.add(res);
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  res.on("close", () => {
    clearInterval(ping);
    set!.delete(res);
    if (!set!.size) clients.delete(userId);
  });
}

export async function closeLive() {
  for (const set of clients.values()) for (const res of set) res.end();
  sub?.disconnect();
}

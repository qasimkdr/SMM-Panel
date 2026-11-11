import { Router, type Request, type Response } from "express";
import { and, eq, inArray, schema } from "@smm/db";
import { V2_STATUS } from "@smm/shared";
import { db } from "../lib/db";
import { cached } from "../lib/cache";
import { redis } from "../lib/redis";
import { HttpError } from "../lib/errors";
import { getSetting } from "../lib/settings";
import { getCatalog, personalize } from "../services/catalog";
import { userDiscount } from "../services/users";
import { placeOrder, requestCancel, requestRefill } from "../services/orders";

/**
 * Reseller API in the standard v2 format: POST (form or JSON) with `key` and `action`.
 * Errors follow the v2 convention: HTTP 200 with { "error": "…" }.
 */
export const v2Router = Router();

const TYPE_LABEL = (t: string) => t.split("_").map((w, i) => (i === 0 ? w[0]!.toUpperCase() + w.slice(1) : w)).join(" ");
const fail = (res: Response, error: string) => res.json({ error });

async function userByKey(key: string) {
  if (!/^[a-f0-9]{48}$/.test(key)) return null;
  return cached(`apikey:${key}`, 300, async () => {
    const [u] = await db
      .select({ id: schema.users.id, status: schema.users.status, apiEnabled: schema.users.apiEnabled, balance: schema.users.balance })
      .from(schema.users)
      .where(eq(schema.users.apiKey, key))
      .limit(1);
    return u ? { id: u.id, ok: u.status === "active" && u.apiEnabled } : null;
  });
}

const ids = (v: unknown, max = 100) =>
  String(v ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, max);

async function handle(req: Request, res: Response) {
  const p = { ...req.query, ...req.body } as Record<string, string>;
  if (!(await getSetting("features.api", true))) return fail(res, "API access is disabled");
  const user = p.key ? await userByKey(String(p.key)) : null;
  if (!user) return fail(res, "Invalid API key");
  if (!user.ok) return fail(res, "API access is disabled for this account");

  // Per-key limit (shared across API instances).
  const bucket = `rl:v2:${user.id}:${Math.floor(Date.now() / 60_000)}`;
  const n = await redis.incr(bucket);
  if (n === 1) await redis.expire(bucket, 61);
  if (n > 600) return res.status(429).json({ error: "Too many requests. Slow down to 600 per minute." });

  try {
    switch (p.action) {
      case "services": {
        const catalog = personalize(await getCatalog(), await userDiscount(user.id));
        return res.json(
          catalog.flatMap((c) =>
            c.services.map((s) => ({
              service: s.id,
              name: s.name,
              type: TYPE_LABEL(s.type),
              category: c.name,
              rate: s.rate,
              min: String(s.min),
              max: String(s.max),
              refill: s.refill,
              cancel: s.cancel,
              dripfeed: s.dripfeed,
            })),
          ),
        );
      }
      case "add": {
        const r = await placeOrder(user.id, p, { viaApi: true, idempotencyKey: req.get("idempotency-key") });
        return res.json({ order: r.order });
      }
      case "status": {
        const list = p.orders ? ids(p.orders) : ids(p.order, 1);
        if (!list.length) return fail(res, "Incorrect order ID");
        const rows = await db
          .select({ id: schema.orders.id, charge: schema.orders.charge, refunded: schema.orders.refunded, startCount: schema.orders.startCount, status: schema.orders.status, remains: schema.orders.remains })
          .from(schema.orders)
          .where(and(eq(schema.orders.userId, user.id), inArray(schema.orders.id, list)));
        const byId = new Map(rows.map((r) => [r.id, r]));
        const fmt = (r: (typeof rows)[number]) => ({
          charge: (Number(r.charge) - Number(r.refunded)).toFixed(5),
          start_count: String(r.startCount ?? 0),
          status: V2_STATUS[r.status] ?? "Pending",
          remains: String(r.remains ?? 0),
          currency: "USD",
        });
        if (!p.orders) {
          const r = byId.get(list[0]!);
          return r ? res.json(fmt(r)) : fail(res, "Incorrect order ID");
        }
        return res.json(Object.fromEntries(list.map((id) => [id, byId.has(id) ? fmt(byId.get(id)!) : { error: "Incorrect order ID" }])));
      }
      case "refill": {
        if (p.orders) {
          const out = [];
          for (const id of ids(p.orders)) {
            try {
              out.push({ order: id, refill: (await requestRefill(user.id, id)).refill });
            } catch (e) {
              out.push({ order: id, refill: { error: (e as Error).message } });
            }
          }
          return res.json(out);
        }
        const id = ids(p.order, 1)[0];
        if (!id) return fail(res, "Incorrect order ID");
        return res.json({ refill: (await requestRefill(user.id, id)).refill });
      }
      case "refill_status": {
        const list = p.refills ? ids(p.refills) : ids(p.refill, 1);
        const rows = await db
          .select({ id: schema.refills.id, status: schema.refills.status })
          .from(schema.refills)
          .where(and(eq(schema.refills.userId, user.id), inArray(schema.refills.id, list.length ? list : [0])));
        const label = (s: string) => ({ pending: "Pending", in_progress: "In progress", completed: "Completed", rejected: "Rejected", fail: "Rejected" })[s] ?? "Pending";
        if (!p.refills) return rows[0] ? res.json({ status: label(rows[0].status) }) : fail(res, "Refill not found");
        const m = new Map(rows.map((r) => [r.id, r]));
        return res.json(list.map((id) => ({ refill: id, status: m.has(id) ? label(m.get(id)!.status) : { error: "Refill not found" } })));
      }
      case "cancel": {
        const out = [];
        for (const id of ids(p.orders ?? p.order)) {
          try {
            await requestCancel(user.id, id);
            out.push({ order: id, cancel: 1 });
          } catch (e) {
            out.push({ order: id, cancel: { error: (e as Error).message } });
          }
        }
        return res.json(out);
      }
      case "balance": {
        const [u] = await db.select({ balance: schema.users.balance }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
        return res.json({ balance: Number(u?.balance ?? 0).toFixed(5), currency: "USD" });
      }
      default:
        return fail(res, "Incorrect request");
    }
  } catch (e) {
    if (e instanceof HttpError) return fail(res, e.fields && e.status === 400 ? Object.values(e.fields).join("; ") : e.message);
    throw e;
  }
}

v2Router.post("/", handle);
v2Router.get("/", handle);

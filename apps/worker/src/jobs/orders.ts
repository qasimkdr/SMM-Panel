import type { Job } from "bullmq";
import { and, asc, eq, inArray, isNotNull, schema, settleOrder, sql } from "@smm/db";
import {
  FINAL_ORDER_STATUSES,
  LINES_AS_QUANTITY,
  PACKAGE_TYPES,
  orderChannel,
  type OrderEvent,
  type OrderStatus,
  type ServiceType,
} from "@smm/shared";
import { connection, db, logger } from "../lib";
import { driverFor, ProviderError, type AddOrderParams } from "../providers";
import { usdConverter } from "./provider";

export type OrderJob = { kind: "place"; orderId: number } | { kind: "refill"; refillId: number } | { kind: "cancel"; orderId: number };

const publish = (userId: number, e: OrderEvent) => connection.publish(orderChannel(userId), JSON.stringify(e));

async function loadProvider(id: number | null) {
  if (!id) return null;
  const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, id)).limit(1);
  return p ?? null;
}

function buildParams(
  o: typeof schema.orders.$inferSelect,
  type: ServiceType,
  providerServiceId: string,
): AddOrderParams {
  const extra = (o.extra ?? {}) as Record<string, string | number>;
  const params: AddOrderParams = { service: providerServiceId, link: o.link, ...extra };
  if (!PACKAGE_TYPES.includes(type) && !LINES_AS_QUANTITY.includes(type) && type !== "subscriptions") params.quantity = o.quantity;
  if (type === "subscriptions") delete (params as Record<string, unknown>).link;
  if (o.runs && o.intervalMin) {
    params.runs = o.runs;
    params.interval = o.intervalMin;
  }
  return params;
}

/** Sends one order to its provider (falls back to the backup provider if the main one refuses). */
async function place(orderId: number, job: Job) {
  // Atomic claim: if the customer canceled first, or it was already sent, do nothing.
  const [claim] = await db
    .update(schema.orders)
    .set({ status: "processing" })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.status, "pending"), sql`${schema.orders.providerOrderId} IS NULL`));
  if (claim.affectedRows !== 1) return { skipped: true };

  const [row] = await db
    .select({ o: schema.orders, s: schema.services })
    .from(schema.orders)
    .innerJoin(schema.services, eq(schema.services.id, schema.orders.serviceId))
    .where(eq(schema.orders.id, orderId))
    .limit(1);
  if (!row) return { skipped: true };
  const { o, s } = row;
  const type = s.type as ServiceType;

  const attempts: { providerId: number | null; serviceId: string | null }[] = [
    { providerId: s.providerId, serviceId: s.providerServiceId },
    { providerId: s.backupProviderId, serviceId: s.backupProviderServiceId },
  ];
  let lastError: unknown = null;
  for (const a of attempts) {
    const provider = await loadProvider(a.providerId);
    if (!provider || !a.serviceId || provider.status !== "active") continue;
    try {
      const r = await driverFor(provider).add(buildParams(o, type, a.serviceId));
      await db
        .update(schema.orders)
        .set({ providerOrderId: r.order, providerId: provider.id, error: null, lastCheckedAt: null })
        .where(eq(schema.orders.id, orderId));
      await publish(o.userId, { id: o.id, status: "processing", remains: o.remains, startCount: null });
      logger.info({ orderId, provider: provider.id, providerOrder: r.order }, "order sent");
      return { providerOrderId: r.order, providerId: provider.id };
    } catch (err) {
      lastError = err;
      // Transient problems on the main provider: retry the whole job later rather than jumping to backup.
      if (!(err instanceof ProviderError && err.permanent)) break;
    }
  }

  const msg = lastError instanceof Error ? lastError.message : "No provider available for this service";
  const permanent = lastError === null || (lastError instanceof ProviderError && lastError.permanent);
  const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  const ourBalance = /balance|funds/i.test(msg);

  if (ourBalance) {
    // Our provider account is out of funds: not the customer's fault. Keep for the admin to top up and resend.
    await db.update(schema.orders).set({ status: lastAttempt ? "fail" : "pending", error: `Provider balance too low: ${msg}`.slice(0, 500) }).where(eq(schema.orders.id, orderId));
    if (!lastAttempt) throw new Error(msg);
    logger.error({ orderId }, "order failed: provider balance too low");
    return { failed: true };
  }
  if (permanent || lastAttempt) {
    // The provider refused it: cancel and refund in full so the customer isn't left waiting.
    const st = await db.transaction((tx) => settleOrder(tx, orderId, { status: "canceled", error: `Provider refused the order: ${msg}` }));
    if (st) await publish(st.userId, { id: orderId, status: "canceled", remains: st.before.remains, startCount: null, refunded: st.refunded });
    logger.warn({ orderId, msg }, "order canceled and refunded");
    return { canceled: true };
  }
  await db.update(schema.orders).set({ status: "pending", error: msg.slice(0, 500) }).where(eq(schema.orders.id, orderId));
  throw new Error(msg); // BullMQ retries with exponential backoff
}

async function refill(refillId: number) {
  const [r] = await db
    .select({ r: schema.refills, o: schema.orders })
    .from(schema.refills)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.refills.orderId))
    .where(eq(schema.refills.id, refillId))
    .limit(1);
  if (!r || r.r.status !== "pending" || r.r.providerRefillId) return { skipped: true };
  const provider = await loadProvider(r.o.providerId);
  if (!provider || !r.o.providerOrderId) {
    await db.update(schema.refills).set({ status: "rejected", error: "Order was never sent to a provider" }).where(eq(schema.refills.id, refillId));
    return { rejected: true };
  }
  try {
    const res = await driverFor(provider).refill(r.o.providerOrderId);
    await db.update(schema.refills).set({ providerRefillId: res.refill, status: "in_progress" }).where(eq(schema.refills.id, refillId));
    return { providerRefillId: res.refill };
  } catch (err) {
    if (err instanceof ProviderError && err.permanent) {
      await db.update(schema.refills).set({ status: "rejected", error: err.message.slice(0, 255) }).where(eq(schema.refills.id, refillId));
      return { rejected: true };
    }
    throw err;
  }
}

async function cancel(orderId: number) {
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
  if (!o || FINAL_ORDER_STATUSES.includes(o.status) || !o.providerOrderId) return { skipped: true };
  const provider = await loadProvider(o.providerId);
  if (!provider) return { skipped: true };
  const r = await driverFor(provider).cancel([o.providerOrderId]);
  const res = r[o.providerOrderId];
  if (res && !res.ok) await db.update(schema.orders).set({ error: `Cancel refused by provider: ${res.error ?? "unknown"}`.slice(0, 500) }).where(eq(schema.orders.id, orderId));
  // If accepted, the status poller sees "Canceled" and refunds.
  return { requested: true, ok: res?.ok ?? false };
}

export function runOrderJob(job: Job<OrderJob>) {
  const d = job.data;
  if (d.kind === "place") return place(d.orderId, job);
  if (d.kind === "refill") return refill(d.refillId);
  return cancel(d.orderId);
}

/**
 * Status poller: one provider request per 100 orders (standard multi-status), oldest-checked first.
 * Changes are settled (refunds for partial/canceled) and pushed live to the customer.
 */
export async function pollStatuses(maxOrders = 3000) {
  const rows = await db
    .select({
      id: schema.orders.id,
      userId: schema.orders.userId,
      providerId: schema.orders.providerId,
      providerOrderId: schema.orders.providerOrderId,
      status: schema.orders.status,
      remains: schema.orders.remains,
      startCount: schema.orders.startCount,
      serviceId: schema.orders.serviceId,
      createdAt: schema.orders.createdAt,
    })
    .from(schema.orders)
    .where(and(inArray(schema.orders.status, ["processing", "in_progress"]), isNotNull(schema.orders.providerOrderId)))
    .orderBy(asc(sql`COALESCE(${schema.orders.lastCheckedAt}, '1970-01-01')`))
    .limit(maxOrders);

  const byProvider = new Map<number, typeof rows>();
  for (const r of rows) {
    if (!r.providerId) continue;
    const list = byProvider.get(r.providerId) ?? [];
    list.push(r);
    byProvider.set(r.providerId, list);
  }

  let changed = 0;
  for (const [providerId, list] of byProvider) {
    const provider = await loadProvider(providerId);
    if (!provider) continue;
    const driver = driverFor(provider);
    const toUsd = await usdConverter(provider.currency);
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      let statuses;
      try {
        statuses = await driver.statuses(chunk.map((c) => c.providerOrderId!));
      } catch (err) {
        logger.warn({ providerId, err: String(err) }, "status check failed");
        break; // try this provider again next round
      }
      const untouched: number[] = [];
      for (const o of chunk) {
        const st = statuses[o.providerOrderId!];
        if (!st || st.error) {
          untouched.push(o.id);
          continue;
        }
        const next: OrderStatus = st.status === "pending" ? "processing" : st.status;
        if (next === o.status && st.remains === o.remains && st.startCount === o.startCount) {
          untouched.push(o.id);
          continue;
        }
        const res = await db.transaction((tx) =>
          settleOrder(tx, o.id, {
            status: next,
            remains: st.remains,
            startCount: st.startCount,
            providerCostUsd: st.charge ? toUsd(st.charge) : null,
          }),
        );
        changed++;
        await publish(o.userId, { id: o.id, status: next, remains: st.remains, startCount: st.startCount, refunded: res?.refunded });
        if (next === "completed") {
          const sec = Math.round((Date.now() - o.createdAt.getTime()) / 1000);
          // Rolling average completion time shown on the services list.
          await db
            .update(schema.services)
            .set({ avgTimeSec: sql`IF(${schema.services.avgTimeSec} IS NULL, ${sec}, ROUND(${schema.services.avgTimeSec} * 0.8 + ${sec} * 0.2))` })
            .where(eq(schema.services.id, o.serviceId));
        }
      }
      if (untouched.length) await db.update(schema.orders).set({ lastCheckedAt: new Date() }).where(inArray(schema.orders.id, untouched));
    }
  }
  if (rows.length) logger.debug({ checked: rows.length, changed }, "status poll");
  return { checked: rows.length, changed };
}

/** Refill status poller (no batch action in v2, so capped per run). */
export async function pollRefills(max = 200) {
  const rows = await db
    .select({ r: schema.refills, providerId: schema.orders.providerId })
    .from(schema.refills)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.refills.orderId))
    .where(and(eq(schema.refills.status, "in_progress"), isNotNull(schema.refills.providerRefillId)))
    .orderBy(asc(schema.refills.updatedAt))
    .limit(max);
  let changed = 0;
  for (const row of rows) {
    const provider = await loadProvider(row.providerId);
    if (!provider) continue;
    try {
      const { status } = await driverFor(provider).refillStatus(row.r.providerRefillId!);
      const s = status.toLowerCase();
      const next = s.includes("complete") ? "completed" : s.includes("reject") || s.includes("cancel") ? "rejected" : "in_progress";
      await db.update(schema.refills).set({ status: next }).where(eq(schema.refills.id, row.r.id)); // also bumps updated_at
      if (next !== "in_progress") changed++;
    } catch (err) {
      logger.warn({ refill: row.r.id, err: String(err) }, "refill status failed");
    }
  }
  return { checked: rows.length, changed };
}

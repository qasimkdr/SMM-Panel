import { and, desc, eq, inArray, isNull, lt, like, schema, settleOrder, sql, applyBalanceChange, BalanceError, type SQL } from "@smm/db";
import {
  applyDiscount,
  normalizeOrder,
  orderChannel,
  orderCharge,
  orderInputSchema,
  type OrderEvent,
  type OrderInput,
  type ServiceType,
} from "@smm/shared";
import { db } from "../lib/db";
import { redis } from "../lib/redis";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../lib/errors";
import { getSetting } from "../lib/settings";
import { ordersQueue } from "../lib/queues";
import { getServiceIndex } from "./catalog";
import { userDiscount } from "./users";

const ACTIVE: ("pending" | "processing" | "in_progress")[] = ["pending", "processing", "in_progress"];

export async function publishOrder(userId: number, e: OrderEvent) {
  await redis.publish(orderChannel(userId), JSON.stringify(e));
}

async function assertCanOrder(userId: number) {
  const [u] = await db
    .select({ status: schema.users.status, verified: schema.users.emailVerifiedAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!u) throw notFound("Account not found");
  if (u.status !== "active") throw forbidden("This account is suspended. Contact support.");
  if (!u.verified && (await getSetting("auth.requireEmailVerification", true)))
    throw new HttpError(403, "email_unverified", "Confirm your email before placing orders. Check your inbox for the link.");
}

export interface PlacedOrder {
  order: number;
  charge: string;
  balance: string;
  status: string;
  duplicate?: boolean;
}

/**
 * Places an order. Price comes from the server-side catalog (commission + user discount);
 * anything price-like in the request is ignored. One transaction: insert order → debit balance
 * (row-locked) → ledger row. Provider delivery happens later in the worker.
 */
export async function placeOrder(
  userId: number,
  raw: unknown,
  opts: { viaApi?: boolean; idempotencyKey?: string | null; skipChecks?: boolean } = {},
): Promise<PlacedOrder> {
  if (await getSetting("site.maintenance", false))
    throw new HttpError(503, "maintenance", "We're doing maintenance. Ordering is paused for a few minutes.");
  if (!opts.skipChecks) await assertCanOrder(userId);
  const parsed = orderInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[i.path.join(".")] ??= i.message;
    throw badRequest("Please check the highlighted fields", fields);
  }
  const input: OrderInput = parsed.data;
  const service = (await getServiceIndex())[String(input.service)];
  if (!service) throw badRequest("This service isn't available right now", { service: `Service #${input.service} isn't available. Pick another one.` });

  const result = normalizeOrder(input, {
    type: service.type as ServiceType,
    minQty: service.minQty,
    maxQty: service.maxQty,
    dripfeed: service.dripfeed,
  });
  if (!result.ok) throw badRequest("Please check the highlighted fields", result.errors);
  const o = result.order;

  const idem = opts.idempotencyKey?.slice(0, 64) || null;
  if (idem) {
    const [existing] = await db
      .select({ id: schema.orders.id, charge: schema.orders.charge, status: schema.orders.status })
      .from(schema.orders)
      .where(and(eq(schema.orders.userId, userId), eq(schema.orders.idempotencyKey, idem)))
      .limit(1);
    if (existing) return { order: existing.id, charge: existing.charge, status: existing.status, balance: "", duplicate: true };
  }

  if (await getSetting("orders.blockDuplicateActive", true)) {
    const [dup] = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.userId, userId),
          inArray(schema.orders.status, ACTIVE),
          eq(schema.orders.serviceId, service.id),
          eq(schema.orders.link, o.link),
        ),
      )
      .limit(1);
    if (dup) throw conflict(`You already have an active order (#${dup.id}) for this link and service. Wait for it to finish first.`, { link: "Active order exists for this link" });
  }

  const rate = applyDiscount(service.sellRate, await userDiscount(userId));
  const charge = orderCharge(service.type as ServiceType, rate, o.totalQuantity);
  const providerCost = service.providerRate ? orderCharge(service.type as ServiceType, service.providerRate, o.totalQuantity) : null;

  let orderId: number;
  let balance: string;
  try {
    ({ orderId, balance } = await db.transaction(async (tx) => {
      const [r] = await tx.insert(schema.orders).values({
        userId,
        serviceId: service.id,
        providerId: service.mode === "auto" ? service.providerId : null,
        link: o.link,
        quantity: o.quantity,
        runs: o.runs,
        intervalMin: o.interval,
        charge,
        providerCost,
        profit: providerCost ? (Number(charge) - Number(providerCost)).toFixed(6) : charge,
        remains: o.totalQuantity,
        mode: service.mode,
        extra: Object.keys(o.extra).length ? o.extra : null,
        viaApi: Boolean(opts.viaApi),
        idempotencyKey: idem,
      });
      const id = Number(r.insertId);
      const b = await applyBalanceChange(tx, {
        userId,
        amount: `-${charge}`,
        type: "order",
        refType: "order",
        refId: id,
        note: `Order #${id}`,
        spentDelta: charge,
      });
      return { orderId: id, balance: b.balance };
    }));
  } catch (e) {
    if (e instanceof BalanceError && e.code === "insufficient")
      throw new HttpError(402, "insufficient_balance", `Not enough balance. This order costs $${Number(charge).toFixed(2)}.`);
    if ((e as { cause?: { code?: string } })?.cause?.code === "ER_DUP_ENTRY" && idem) return placeOrder(userId, raw, { ...opts, skipChecks: true });
    throw e;
  }

  if (service.mode === "auto") await ordersQueue.add("place", { kind: "place", orderId }, { jobId: `place-${orderId}` });
  await publishOrder(userId, { id: orderId, status: "pending", remains: o.totalQuantity, startCount: null });
  return { order: orderId, charge, balance, status: "pending" };
}

export interface OrderListQuery {
  status?: string;
  q?: string;
  cursor?: number;
  limit?: number;
}

/** Cursor pagination (id DESC), served by the (user_id, id) / (user_id, status, id) indexes. */
export async function listOrders(userId: number | null, q: OrderListQuery, extraConds: SQL[] = []) {
  const limit = Math.min(Math.max(q.limit ?? 30, 1), 100);
  const conds: SQL[] = [...extraConds];
  if (userId) conds.push(eq(schema.orders.userId, userId));
  if (q.cursor) conds.push(lt(schema.orders.id, q.cursor));
  if (q.status && q.status !== "all") conds.push(eq(schema.orders.status, q.status as "pending"));
  if (q.q) {
    const n = Number(q.q.replace(/^#/, ""));
    conds.push(Number.isInteger(n) && n > 0 ? eq(schema.orders.id, n) : like(schema.orders.link, `%${q.q.replace(/[%_]/g, "\\$&")}%`));
  }
  const rows = await db
    .select({
      id: schema.orders.id,
      serviceId: schema.orders.serviceId,
      serviceName: schema.services.name,
      link: schema.orders.link,
      quantity: schema.orders.quantity,
      runs: schema.orders.runs,
      intervalMin: schema.orders.intervalMin,
      charge: schema.orders.charge,
      refunded: schema.orders.refunded,
      startCount: schema.orders.startCount,
      remains: schema.orders.remains,
      status: schema.orders.status,
      mode: schema.orders.mode,
      createdAt: schema.orders.createdAt,
      completedAt: schema.orders.completedAt,
      refill: schema.services.refill,
      refillDays: schema.services.refillDays,
      cancel: schema.services.cancel,
    })
    .from(schema.orders)
    .leftJoin(schema.services, eq(schema.services.id, schema.orders.serviceId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.orders.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return { items: page, nextCursor: rows.length > limit ? page[page.length - 1]!.id : null };
}

export async function requestRefill(userId: number, orderId: number) {
  const [o] = await db
    .select({ o: schema.orders, refill: schema.services.refill, refillDays: schema.services.refillDays })
    .from(schema.orders)
    .leftJoin(schema.services, eq(schema.services.id, schema.orders.serviceId))
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.userId, userId)))
    .limit(1);
  if (!o) throw notFound("Order not found");
  if (!o.refill) throw badRequest("This service doesn't include refills");
  if (o.o.status !== "completed" && o.o.status !== "partial") throw badRequest("Refills are available once the order is completed");
  if (o.refillDays && o.o.completedAt && Date.now() - o.o.completedAt.getTime() > o.refillDays * 86_400_000)
    throw badRequest(`The ${o.refillDays}-day refill period for this order has ended`);
  const [open] = await db
    .select({ id: schema.refills.id })
    .from(schema.refills)
    .where(and(eq(schema.refills.orderId, orderId), inArray(schema.refills.status, ["pending", "in_progress"])))
    .limit(1);
  if (open) throw conflict("A refill for this order is already in progress");
  const [recent] = await db
    .select({ id: schema.refills.id })
    .from(schema.refills)
    .where(and(eq(schema.refills.orderId, orderId), sql`${schema.refills.createdAt} > NOW() - INTERVAL 24 HOUR`))
    .limit(1);
  if (recent) throw conflict("You can request one refill per order every 24 hours");

  const [r] = await db.insert(schema.refills).values({ orderId, userId, status: "pending" });
  const refillId = Number(r.insertId);
  if (o.o.mode === "auto") await ordersQueue.add("refill", { kind: "refill", refillId }, { jobId: `refill-${refillId}` });
  return { refill: refillId };
}

/**
 * Cancel: if the order hasn't reached the provider yet, cancel locally with a full refund
 * (atomic claim so the worker can't send it at the same moment). Otherwise ask the provider.
 */
export async function requestCancel(userId: number | null, orderId: number) {
  const [o] = await db
    .select({ o: schema.orders, cancel: schema.services.cancel })
    .from(schema.orders)
    .leftJoin(schema.services, eq(schema.services.id, schema.orders.serviceId))
    .where(and(eq(schema.orders.id, orderId), ...(userId ? [eq(schema.orders.userId, userId)] : [])))
    .limit(1);
  if (!o) throw notFound("Order not found");
  if (userId && !o.cancel) throw badRequest("This service can't be canceled");
  if (!ACTIVE.includes(o.o.status as "pending")) throw badRequest("Only active orders can be canceled");

  const [claim] = await db
    .update(schema.orders)
    .set({ status: "canceled", error: "Canceled before it was sent" })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.status, "pending"), isNull(schema.orders.providerOrderId)));
  if (claim.affectedRows === 1) {
    const s = await db.transaction((tx) => settleOrder(tx, orderId, { status: "canceled" }));
    await ordersQueue.remove(`place-${orderId}`).catch(() => null);
    if (s) await publishOrder(s.userId, { id: orderId, status: "canceled", remains: s.before.remains, startCount: s.before.startCount, refunded: s.refunded });
    return { canceled: true, refunded: s?.refunded ?? "0" };
  }
  if (o.o.mode === "manual") throw badRequest("Your order is already being worked on and can't be canceled");
  await ordersQueue.add("cancel", { kind: "cancel", orderId }, { jobId: `cancel-${orderId}-${Date.now()}` });
  return { canceled: false, requested: true };
}


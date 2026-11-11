import { Router } from "express";
import { z } from "zod";
import { eq, inArray, schema, settleOrder, type SQL } from "@smm/db";
import { db } from "../../lib/db";
import { badRequest, notFound } from "../../lib/errors";
import { ordersQueue } from "../../lib/queues";
import { parse } from "../../middleware/validate";
import { listOrders, publishOrder, requestCancel } from "../../services/orders";
import { audit } from "../../services/audit";

export const adminOrdersRouter = Router();

adminOrdersRouter.get("/", async (req, res) => {
  const q = parse(
    z.object({
      status: z.string().max(20).optional(),
      q: z.string().trim().max(200).optional(),
      cursor: z.coerce.number().int().positive().optional(),
      mode: z.enum(["auto", "manual"]).optional(),
      userId: z.coerce.number().int().positive().optional(),
      providerId: z.coerce.number().int().positive().optional(),
    }),
    req.query,
  );
  const extra: SQL[] = [];
  if (q.mode) extra.push(eq(schema.orders.mode, q.mode));
  if (q.userId) extra.push(eq(schema.orders.userId, q.userId));
  if (q.providerId) extra.push(eq(schema.orders.providerId, q.providerId));
  const data = await listOrders(null, { ...q, limit: 50 }, extra);
  // Admin view adds who ordered, provider info and money.
  const ids = data.items.map((i) => i.id);
  const more = ids.length
    ? await db
        .select({
          id: schema.orders.id,
          userId: schema.orders.userId,
          username: schema.users.username,
          providerOrderId: schema.orders.providerOrderId,
          providerName: schema.providers.name,
          providerCost: schema.orders.providerCost,
          profit: schema.orders.profit,
          error: schema.orders.error,
          viaApi: schema.orders.viaApi,
          extra: schema.orders.extra,
        })
        .from(schema.orders)
        .innerJoin(schema.users, eq(schema.users.id, schema.orders.userId))
        .leftJoin(schema.providers, eq(schema.providers.id, schema.orders.providerId))
        .where(inArray(schema.orders.id, ids))
    : [];
  const byId = new Map(more.map((m) => [m.id, m]));
  res.json({ ...data, items: data.items.map((i) => ({ ...i, ...byId.get(i.id) })) });
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("in_progress") }),
  z.object({ action: z.literal("partial"), remains: z.number().int().min(1) }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("start_count"), startCount: z.number().int().min(0) }),
  z.object({ action: z.literal("resend") }),
]);

/** Manual processing and fixes. Money is settled by the same idempotent settleOrder() the worker uses. */
adminOrdersRouter.post("/:id/action", async (req, res) => {
  const id = Number(req.params.id);
  const input = parse(actionSchema, req.body);
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id)).limit(1);
  if (!o) throw notFound("Order not found");

  if (input.action === "resend") {
    if (o.mode !== "auto" || o.providerOrderId) throw badRequest("Only provider orders that haven't been sent can be resent");
    await db.update(schema.orders).set({ status: "pending", error: null }).where(eq(schema.orders.id, id));
    await ordersQueue.add("place", { kind: "place", orderId: id }, { jobId: `place-${id}-${Date.now()}` });
    await audit(req, "order.resend", "order", id);
    return res.json({ ok: true });
  }
  if (input.action === "cancel" && o.providerOrderId && ["pending", "processing", "in_progress"].includes(o.status)) {
    // Also ask the provider to stop; the refund is applied right away.
    await requestCancel(null, id).catch(() => null);
  }
  const total = o.quantity * (o.runs ?? 1);
  if (input.action === "partial" && input.remains >= total) throw badRequest("Remains must be less than the ordered quantity. Use Cancel for a full refund.");

  const update =
    input.action === "complete"
      ? { status: "completed" as const }
      : input.action === "in_progress"
        ? { status: "in_progress" as const }
        : input.action === "partial"
          ? { status: "partial" as const, remains: input.remains }
          : input.action === "cancel"
            ? { status: "canceled" as const }
            : { startCount: input.startCount };
  const s = await db.transaction((tx) => settleOrder(tx, id, update));
  if (s) {
    const [after] = await db.select().from(schema.orders).where(eq(schema.orders.id, id)).limit(1);
    if (after) await publishOrder(after.userId, { id, status: after.status, remains: after.remains, startCount: after.startCount, refunded: s.refunded });
  }
  await audit(req, `order.${input.action}`, "order", id, input);
  res.json({ ok: true, refunded: s?.refunded ?? "0" });
});

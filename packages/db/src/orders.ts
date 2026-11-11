import { eq } from "drizzle-orm";
import { divRound, fromMicros, partialRefund, toMicros, FINAL_ORDER_STATUSES, type OrderStatus } from "@smm/shared";
import type { Database } from "./client";
import { applyBalanceChange } from "./ledger";
import { orders } from "./schema";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface OrderUpdate {
  status?: OrderStatus;
  remains?: number | null;
  startCount?: number | null;
  /** What the provider actually charged us, in USD (from their status response). */
  providerCostUsd?: string | null;
  error?: string | null;
  providerOrderId?: string | null;
}

export const totalQuantity = (o: { quantity: number; runs: number | null }) => o.quantity * (o.runs ?? 1);

/**
 * Applies a status change to an order and settles money, idempotently:
 * the refund owed is computed from the target state (canceled → full, partial → unused share)
 * and only the difference to what was already refunded is credited. Running it twice never
 * refunds twice. Locks the order row; the balance change locks the user row.
 */
export async function settleOrder(tx: Tx, orderId: number, u: OrderUpdate) {
  const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!o) return null;

  const status = u.status ?? o.status;
  const remains = u.remains !== undefined ? u.remains : o.remains;
  const total = totalQuantity(o);

  let owed = 0n;
  if (status === "canceled") owed = toMicros(o.charge);
  else if (status === "partial") owed = toMicros(partialRefund(o.charge, total, Math.max(0, Math.min(remains ?? 0, total))));
  const already = toMicros(o.refunded);
  const delta = owed > already ? owed - already : 0n;

  const providerCost = u.providerCostUsd ?? o.providerCost;
  const charge = toMicros(o.charge);
  const refunded = already + delta;
  let costMicros = providerCost && status !== "canceled" ? toMicros(providerCost) : 0n; // canceled = provider refunds us
  // Without a real provider figure, scale the estimate to what was delivered.
  if (!u.providerCostUsd && providerCost && status === "partial") {
    const delivered = total - (remains ?? 0);
    costMicros = divRound(costMicros * BigInt(Math.max(0, delivered)), BigInt(Math.max(1, total)));
  }

  const patch: Partial<typeof orders.$inferInsert> = {
    status,
    remains,
    refunded: fromMicros(refunded),
    profit: fromMicros(charge - refunded - costMicros),
    lastCheckedAt: new Date(),
  };
  if (u.startCount !== undefined) patch.startCount = u.startCount;
  if (u.providerCostUsd) patch.providerCost = fromMicros(toMicros(u.providerCostUsd));
  if (u.error !== undefined) patch.error = u.error?.slice(0, 500) ?? null;
  if (u.providerOrderId !== undefined) patch.providerOrderId = u.providerOrderId;
  if (FINAL_ORDER_STATUSES.includes(status) && !o.completedAt) patch.completedAt = new Date();
  if (status === "completed") patch.remains = 0;

  await tx.update(orders).set(patch).where(eq(orders.id, orderId));
  if (delta > 0n) {
    await applyBalanceChange(tx, {
      userId: o.userId,
      amount: fromMicros(delta),
      type: "refund",
      refType: "order",
      refId: o.id,
      note: status === "canceled" ? `Order #${o.id} canceled` : `Order #${o.id} partial: ${remains} not delivered`,
      spentDelta: fromMicros(-delta),
    });
  }
  return { before: o, status, refunded: fromMicros(delta), userId: o.userId };
}

import { eq, inArray, sql } from "drizzle-orm";
import { divRound, fromMicros, partialRefund, toMicros, FINAL_ORDER_STATUSES, type OrderStatus } from "@smm/shared";
import type { Database } from "./client";
import { applyBalanceChange } from "./ledger";
import { affiliateEarnings, orders, settings, users } from "./schema";

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
  const affiliate = await creditAffiliate(tx, o, status, refunded);
  return { before: o, status, refunded: fromMicros(delta), userId: o.userId, affiliate };
}

/**
 * Affiliate commission, credited once when an order finishes with delivery (completed/partial),
 * on what the customer actually paid after refunds. Atomic increment on the referrer's affiliate
 * balance + an earnings row, inside the same transaction as the settlement.
 */
async function creditAffiliate(tx: Tx, o: typeof orders.$inferSelect, status: string, refundedMicros: bigint) {
  if (o.affiliateCredited || (status !== "completed" && status !== "partial")) return null;
  const [buyer] = await tx.select({ referredBy: users.referredBy }).from(users).where(eq(users.id, o.userId)).limit(1);
  if (!buyer?.referredBy) return null;
  const rows = await tx.select().from(settings).where(inArray(settings.key, ["features.affiliates", "affiliate.commissionPercent"]));
  const conf = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (conf["features.affiliates"] === false) return null;
  const pct = Number(conf["affiliate.commissionPercent"] ?? 0);
  if (!(pct > 0)) return null;
  const net = toMicros(o.charge) - refundedMicros;
  if (net <= 0n) return null;
  const amount = divRound(net * BigInt(Math.round(pct * 100)), 10_000n);
  if (amount <= 0n) return null;
  await tx.update(orders).set({ affiliateCredited: true }).where(eq(orders.id, o.id));
  await tx
    .update(users)
    .set({ affiliateBalance: sql`${users.affiliateBalance} + ${fromMicros(amount)}` })
    .where(eq(users.id, buyer.referredBy));
  await tx.insert(affiliateEarnings).values({ referrerId: buyer.referredBy, userId: o.userId, orderId: o.id, amount: fromMicros(amount) });
  return { referrerId: buyer.referredBy, amount: fromMicros(amount) };
}

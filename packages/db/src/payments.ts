import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { fromMicros, toMicros } from "@smm/shared";
import type { Database } from "./client";
import { applyBalanceChange } from "./ledger";
import { notify } from "./notify";
import { payments } from "./schema";

export class PaymentStateError extends Error {}

/**
 * Credits a pending deposit. Idempotent: the payment row is locked, and only a `pending` payment is credited,
 * so a double click or two admins approving at once can't credit twice.
 */
export async function approvePayment(
  db: Database,
  input: { paymentId: number; amountUsd?: string; actorId?: number | null; note?: string | null; externalId?: string; meta?: unknown },
) {
  const result = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).for("update");
    if (!p) throw new PaymentStateError("Payment not found");
    if (p.status !== "pending") throw new PaymentStateError(`This payment is already ${p.status}`);
    const amount = fromMicros(toMicros(input.amountUsd ?? p.amount));
    if (toMicros(amount) <= 0n) throw new PaymentStateError("Enter an amount above 0");
    await tx
      .update(payments)
      .set({
        status: "completed",
        amount,
        adminNote: input.note ?? p.adminNote,
        reviewedBy: input.actorId ?? null,
        reviewedAt: new Date(),
        ...(input.externalId ? { externalId: input.externalId } : {}),
        ...(input.meta !== undefined ? { meta: input.meta } : {}),
      })
      .where(and(eq(payments.id, p.id), eq(payments.status, "pending")));
    const { balance } = await applyBalanceChange(tx, {
      userId: p.userId,
      amount,
      type: "deposit",
      note: `Deposit #${p.id}${p.gateway ? ` (${p.meta && typeof p.meta === "object" && "method" in p.meta ? String((p.meta as { method: unknown }).method) : p.gateway})` : ""}`.slice(0, 255),
      actorId: input.actorId ?? null,
      refType: "payment",
      refId: p.id,
    });
    return { userId: p.userId, amount, balance };
  });
  await notify(db, {
    userId: result.userId,
    kind: "balance",
    title: `$${Number(result.amount).toFixed(2)} added to your balance`,
    body: "Your deposit was approved. Thank you!",
    href: "/dashboard/add-funds",
  });
  return result;
}

export async function rejectPayment(db: Database, input: { paymentId: number; actorId: number; note: string }) {
  const [p] = await db.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1);
  if (!p) throw new PaymentStateError("Payment not found");
  if (p.status !== "pending") throw new PaymentStateError(`This payment is already ${p.status}`);
  // Free the transaction ID so a customer who typed it wrong can submit the right one.
  const meta = { ...((p.meta as object) ?? {}), rejectedTxnId: p.externalId };
  const [r] = await db
    .update(payments)
    .set({ status: "rejected", externalId: null, adminNote: input.note, reviewedBy: input.actorId, reviewedAt: new Date(), meta })
    .where(and(eq(payments.id, p.id), eq(payments.status, "pending")));
  if (!r.affectedRows) throw new PaymentStateError("This payment was just reviewed by someone else");
  await notify(db, { userId: p.userId, kind: "balance", title: "Your deposit couldn't be confirmed", body: input.note, href: "/dashboard/add-funds" });
}

/* ───────────── Binance Pay (personal account, read-only API key) ───────────── */

export interface BinanceMatch {
  transactionId: string;
  amount: string;
  currency: string;
  /** USD value when the coin is a dollar stablecoin; otherwise null (an admin must review). */
  amountUsd: string | null;
  time: number;
  payer: string | null;
}

const STABLE = new Set(["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "USDP", "DAI", "USD"]);

/**
 * Looks for an incoming Binance Pay transfer whose ID matches what the customer entered, using
 * GET /sapi/v1/pay/transactions (last 100 Pay transactions). The app shows the same number as "Order ID";
 * the API may prefix it (e.g. "M_P_…"), so a match on the end of the ID is accepted for IDs of 8+ digits.
 */
export async function findBinancePayment(apiKey: string, apiSecret: string, enteredId: string): Promise<BinanceMatch | null> {
  const query = `limit=100&recvWindow=10000&timestamp=${Date.now()}`;
  const signature = createHmac("sha256", apiSecret).update(query).digest("hex");
  const res = await fetch(`https://api.binance.com/sapi/v1/pay/transactions?${query}&signature=${signature}`, {
    headers: { "X-MBX-APIKEY": apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => null)) as { code?: string | number; msg?: string; message?: string; data?: Record<string, unknown>[] } | null;
  if (!res.ok || !body || !Array.isArray(body.data)) {
    throw new Error(`Binance: ${body?.msg ?? body?.message ?? `HTTP ${res.status}`}`);
  }
  const id = enteredId.trim();
  for (const t of body.data) {
    const tid = String(t.transactionId ?? "");
    const oid = String(t.orderId ?? "");
    const hit = tid === id || oid === id || (id.length >= 8 && /^\d+$/.test(id) && (tid.endsWith(id) || oid.endsWith(id)));
    if (!hit) continue;
    const amount = String(t.amount ?? "0");
    if (!(Number(amount) > 0)) return null; // outgoing transfer, not a payment to us
    const currency = String(t.currency ?? "").toUpperCase();
    const payerInfo = t.payerInfo as { name?: string; binanceId?: string | number } | undefined;
    return {
      transactionId: tid || oid,
      amount,
      currency,
      amountUsd: STABLE.has(currency) ? fromMicros(toMicros(amount)) : null,
      time: Number(t.transactionTime ?? 0),
      payer: payerInfo?.name ?? (payerInfo?.binanceId ? String(payerInfo.binanceId) : null),
    };
  }
  return null;
}

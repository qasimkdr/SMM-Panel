import { desc, eq, lte } from "drizzle-orm";
import { fromMicros, toMicros } from "@smm/shared";
import type { Database } from "./client";
import { transactions, users, vipTiers } from "./schema";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type TxType = (typeof transactions.$inferInsert)["type"];

export class BalanceError extends Error {
  constructor(
    public code: "not_found" | "insufficient",
    message: string,
  ) {
    super(message);
  }
}

export interface BalanceChange {
  userId: number;
  amount: string; // signed USD: + credit, − debit
  type: TxType;
  note?: string | null;
  actorId?: number | null;
  refType?: string | null;
  refId?: number | null;
  /** Change to lifetime spend (orders +, refunds −). Drives VIP levels. */
  spentDelta?: string;
  allowNegative?: boolean;
}

/**
 * The only way balances change. Must run inside a transaction: locks the user row
 * (SELECT … FOR UPDATE), applies the delta, writes the ledger row, and upgrades the VIP level.
 * Parallel requests for the same user queue on the row lock, so balances can't be overspent.
 */
export async function applyBalanceChange(tx: Tx, c: BalanceChange) {
  const [row] = await tx
    .select({ balance: users.balance, spent: users.spent, vipTierId: users.vipTierId, vipLocked: users.vipLocked })
    .from(users)
    .where(eq(users.id, c.userId))
    .for("update");
  if (!row) throw new BalanceError("not_found", "User not found");

  const next = toMicros(row.balance) + toMicros(c.amount);
  if (next < 0n && !c.allowNegative) throw new BalanceError("insufficient", "Not enough balance");
  const balanceAfter = fromMicros(next);

  const patch: Partial<typeof users.$inferInsert> = { balance: balanceAfter };
  if (c.spentDelta) {
    const spent = toMicros(row.spent) + toMicros(c.spentDelta);
    patch.spent = fromMicros(spent < 0n ? 0n : spent);
    if (!row.vipLocked && toMicros(c.spentDelta) > 0n) {
      // Upgrade only (refunds never downgrade a level the customer already reached).
      const [tier] = await tx
        .select({ id: vipTiers.id, minSpent: vipTiers.minSpent })
        .from(vipTiers)
        .where(lte(vipTiers.minSpent, patch.spent))
        .orderBy(desc(vipTiers.minSpent))
        .limit(1);
      if (tier && tier.id !== row.vipTierId) patch.vipTierId = tier.id;
    }
  }
  await tx.update(users).set(patch).where(eq(users.id, c.userId));
  await tx.insert(transactions).values({
    userId: c.userId,
    type: c.type,
    amount: fromMicros(toMicros(c.amount)),
    balanceAfter,
    note: c.note ?? null,
    actorId: c.actorId ?? null,
    refType: c.refType ?? null,
    refId: c.refId ?? null,
  });
  return { balance: balanceAfter, tierChanged: patch.vipTierId !== undefined };
}

export function adjustBalance(db: Database, c: BalanceChange) {
  return db.transaction((tx) => applyBalanceChange(tx, c));
}

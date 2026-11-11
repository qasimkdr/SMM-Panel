import { eq, schema, sql } from "@smm/db";
import { fromMicros, toMicros } from "@smm/shared";
import { db } from "../lib/db";
import { badRequest, notFound } from "../lib/errors";

type TxType = (typeof schema.transactions.$inferInsert)["type"];

/**
 * The only way balances change. Locks the user row (SELECT ... FOR UPDATE), applies the delta,
 * and writes a ledger row — all in one transaction, so parallel requests can never overspend.
 */
export async function adjustBalance(opts: {
  userId: number;
  amount: string; // signed USD
  type: TxType;
  note?: string;
  actorId?: number;
  refType?: string;
  refId?: number;
  allowNegative?: boolean;
}) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ balance: schema.users.balance })
      .from(schema.users)
      .where(eq(schema.users.id, opts.userId))
      .for("update");
    if (!row) throw notFound("User not found");
    const next = toMicros(row.balance) + toMicros(opts.amount);
    if (next < 0n && !opts.allowNegative) throw badRequest("Not enough balance");
    const balanceAfter = fromMicros(next);
    await tx.update(schema.users).set({ balance: balanceAfter }).where(eq(schema.users.id, opts.userId));
    await tx.insert(schema.transactions).values({
      userId: opts.userId,
      type: opts.type,
      amount: fromMicros(toMicros(opts.amount)),
      balanceAfter,
      note: opts.note ?? null,
      actorId: opts.actorId ?? null,
      refType: opts.refType ?? null,
      refId: opts.refId ?? null,
    });
    return { balance: balanceAfter };
  });
}

export const nowSql = sql`CURRENT_TIMESTAMP`;

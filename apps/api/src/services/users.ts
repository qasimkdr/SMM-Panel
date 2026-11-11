import { eq, schema } from "@smm/db";
import { db } from "../lib/db";
import { cached, invalidate } from "../lib/cache";

/** Effective discount % for a user: custom per-user discount beats VIP tier discount. */
export async function userDiscount(userId: number): Promise<string | null> {
  return cached(`user:${userId}:discount`, 600, async () => {
    const [row] = await db
      .select({ custom: schema.users.customDiscount, tier: schema.vipTiers.discount })
      .from(schema.users)
      .leftJoin(schema.vipTiers, eq(schema.vipTiers.id, schema.users.vipTierId))
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!row) return null;
    return row.custom ?? row.tier ?? null;
  });
}

export const invalidateUserPricing = (userId: number) => invalidate(`user:${userId}:discount`);

export async function getCurrencies() {
  return cached("currencies:enabled", 3600, () =>
    db
      .select({
        code: schema.currencies.code,
        name: schema.currencies.name,
        symbol: schema.currencies.symbol,
        rate: schema.currencies.rate,
        decimals: schema.currencies.decimals,
      })
      .from(schema.currencies)
      .where(eq(schema.currencies.enabled, true))
      .orderBy(schema.currencies.sort),
  );
}

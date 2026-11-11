import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { applyMarkup, resolveMarkup, DEFAULT_GLOBAL_MARKUP } from "@smm/shared";
import type { Database } from "./client";
import { categories, providers, services, settings } from "./schema";

export interface RecomputeFilter {
  serviceIds?: number[];
  categoryId?: number;
  providerId?: number;
}

/**
 * Recalculates services.sell_rate for auto (provider) services using the commission engine.
 * Called after: admin markup changes (any level) and provider price syncs.
 * Returns how many services changed price.
 */
export async function recomputeSellRates(db: Database, filter: RecomputeFilter = {}): Promise<number> {
  const [globalRow] = await db.select().from(settings).where(eq(settings.key, "pricing.globalMarkup")).limit(1);
  const globalMarkup = String(globalRow?.value ?? DEFAULT_GLOBAL_MARKUP);

  const conds = [eq(services.mode, "auto"), isNotNull(services.providerRate)];
  if (filter.serviceIds?.length) conds.push(inArray(services.id, filter.serviceIds));
  if (filter.categoryId) conds.push(eq(services.categoryId, filter.categoryId));
  if (filter.providerId) conds.push(eq(services.providerId, filter.providerId));

  const rows = await db
    .select({
      id: services.id,
      providerRate: services.providerRate,
      sellRate: services.sellRate,
      serviceMarkup: services.markup,
      categoryMarkup: categories.markup,
      providerMarkup: providers.markup,
    })
    .from(services)
    .innerJoin(categories, eq(categories.id, services.categoryId))
    .leftJoin(providers, eq(providers.id, services.providerId))
    .where(and(...conds));

  const updates: { id: number; sell: string }[] = [];
  for (const r of rows) {
    const { percent } = resolveMarkup({
      service: r.serviceMarkup,
      category: r.categoryMarkup,
      provider: r.providerMarkup,
      global: globalMarkup,
    });
    const sell = applyMarkup(r.providerRate!, percent);
    if (sell !== r.sellRate) updates.push({ id: r.id, sell });
  }

  // Batch updates with CASE to keep round trips low.
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    const cases = sql.join(
      chunk.map((u) => sql`WHEN ${u.id} THEN ${u.sell}`),
      sql` `,
    );
    await db
      .update(services)
      .set({ sellRate: sql`CASE ${services.id} ${cases} END` })
      .where(inArray(services.id, chunk.map((u) => u.id)));
  }
  return updates.length;
}

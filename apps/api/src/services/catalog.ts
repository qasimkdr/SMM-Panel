import { and, asc, eq, schema } from "@smm/db";
import { applyDiscount } from "@smm/shared";
import { db } from "../lib/db";
import { cached, invalidate } from "../lib/cache";

export interface CatalogService {
  id: number;
  name: string;
  description: string | null;
  type: string;
  rate: string; // USD per 1000, after commission
  min: number;
  max: number;
  refill: boolean;
  refillDays: number;
  cancel: boolean;
  dripfeed: boolean;
  avgTimeSec: number | null;
  badges: string[];
}
export interface CatalogCategory {
  id: number;
  name: string;
  slug: string;
  platform: string;
  services: CatalogService[];
}

const KEY = "catalog:v1";

/**
 * The full public catalog, built once and kept in Redis. Rebuilt only when an admin edits
 * services/markups or a provider sync changes prices (they call invalidateCatalog()).
 * Provider cost and markup are never part of this payload.
 */
export function getCatalog(): Promise<CatalogCategory[]> {
  return cached(KEY, 24 * 3600, async () => {
    const rows = await db
      .select({ c: schema.categories, s: schema.services })
      .from(schema.services)
      .innerJoin(schema.categories, eq(schema.categories.id, schema.services.categoryId))
      .where(and(eq(schema.services.status, "active"), eq(schema.categories.status, "active")))
      .orderBy(asc(schema.categories.sort), asc(schema.categories.id), asc(schema.services.sort), asc(schema.services.id));

    const byCat = new Map<number, CatalogCategory>();
    for (const { c, s } of rows) {
      let cat = byCat.get(c.id);
      if (!cat) {
        cat = { id: c.id, name: c.name, slug: c.slug, platform: c.platform, services: [] };
        byCat.set(c.id, cat);
      }
      cat.services.push({
        id: s.id,
        name: s.name,
        description: s.description,
        type: s.type,
        rate: s.sellRate,
        min: s.minQty,
        max: s.maxQty,
        refill: s.refill,
        refillDays: s.refillDays,
        cancel: s.cancel,
        dripfeed: s.dripfeed,
        avgTimeSec: s.avgTimeSec,
        badges: s.badges ?? [],
      });
    }
    return [...byCat.values()];
  });
}

export const invalidateCatalog = () => invalidate(KEY);

/** Applies a user's discount (VIP or custom) on top of the cached catalog — CPU only, no DB. */
export function personalize(catalog: CatalogCategory[], discount: string | null): CatalogCategory[] {
  if (!discount || Number(discount) <= 0) return catalog;
  return catalog.map((c) => ({
    ...c,
    services: c.services.map((s) => ({ ...s, rate: applyDiscount(s.rate, discount) })),
  }));
}

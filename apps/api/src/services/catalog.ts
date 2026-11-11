import { and, asc, eq, schema } from "@smm/db";
import { applyDiscount } from "@smm/shared";
import { db } from "../lib/db";
import { cached, invalidate } from "../lib/cache";
import { env } from "../env";

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
const INDEX_KEY = "catalog:index:v1";

/** Internal data the order path needs per service (never sent to customers). */
export interface ServiceIndexEntry {
  id: number;
  name: string;
  type: string;
  mode: "auto" | "manual";
  providerId: number | null;
  providerRate: string | null;
  sellRate: string;
  minQty: number;
  maxQty: number;
  dripfeed: boolean;
  cancel: boolean;
  refill: boolean;
  refillDays: number;
}

/** Active, orderable services keyed by id — cached like the catalog, so placing an order needs no catalog query. */
export function getServiceIndex(): Promise<Record<string, ServiceIndexEntry>> {
  return cached(INDEX_KEY, 24 * 3600, async () => {
    const rows = await db
      .select({
        id: schema.services.id,
        name: schema.services.name,
        type: schema.services.type,
        mode: schema.services.mode,
        providerId: schema.services.providerId,
        providerRate: schema.services.providerRate,
        sellRate: schema.services.sellRate,
        minQty: schema.services.minQty,
        maxQty: schema.services.maxQty,
        dripfeed: schema.services.dripfeed,
        cancel: schema.services.cancel,
        refill: schema.services.refill,
        refillDays: schema.services.refillDays,
      })
      .from(schema.services)
      .innerJoin(schema.categories, eq(schema.categories.id, schema.services.categoryId))
      .where(and(eq(schema.services.status, "active"), eq(schema.categories.status, "active")));
    return Object.fromEntries(rows.map((r) => [String(r.id), r]));
  });
}

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

/** Drops the cached catalog and asks the web app to refresh its ISR pages (fire-and-forget). */
export async function invalidateCatalog() {
  await invalidate(KEY, INDEX_KEY);
  if (env.REVALIDATE_SECRET)
    void fetch(`${env.WEB_INTERNAL_URL}/revalidate`, {
      method: "POST",
      headers: { "x-revalidate-secret": env.REVALIDATE_SECRET, "Content-Type": "application/json" },
      body: JSON.stringify({ paths: ["/services", "/"] }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
}

/** Applies a user's discount (VIP or custom) on top of the cached catalog — CPU only, no DB. */
export function personalize(catalog: CatalogCategory[], discount: string | null): CatalogCategory[] {
  if (!discount || Number(discount) <= 0) return catalog;
  return catalog.map((c) => ({
    ...c,
    services: c.services.map((s) => ({ ...s, rate: applyDiscount(s.rate, discount) })),
  }));
}

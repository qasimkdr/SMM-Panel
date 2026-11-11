import { and, eq, recomputeSellRates, schema, sql } from "@smm/db";
import { divRound, fromMicros, toMicros, type ProviderJob, type ProviderServiceItem } from "@smm/shared";
import { connection, db, logger } from "../lib";
import { driverFor, ProviderError } from "../providers";
import { invalidateCatalog } from "../catalog";

export interface CachedProviderService extends ProviderServiceItem {
  rateUsd: string;
}
export const providerCatalogKey = (id: number) => `provider:${id}:catalog`;

async function loadProvider(id: number) {
  const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, id)).limit(1);
  if (!p) throw new ProviderError("Provider not found", true);
  return p;
}

/** Converts a provider-currency amount to USD using our currency table (rate = units per 1 USD). */
async function usdConverter(currency: string) {
  if (currency === "USD") return (v: string) => fromMicros(toMicros(v));
  const [c] = await db.select().from(schema.currencies).where(eq(schema.currencies.code, currency)).limit(1);
  if (!c || Number(c.rate) <= 0) {
    logger.warn({ currency }, "unknown provider currency; treating rates as USD");
    return (v: string) => fromMicros(toMicros(v));
  }
  const rate = toMicros(c.rate);
  return (v: string) => fromMicros(divRound(toMicros(v) * 1_000_000n, rate));
}

async function recordError(id: number, err: unknown) {
  const msg = (err instanceof Error ? err.message : String(err)).slice(0, 255);
  await db
    .update(schema.providers)
    .set({ errorCount: sql`${schema.providers.errorCount} + 1`, lastError: msg })
    .where(eq(schema.providers.id, id));
}

async function refreshBalance(p: typeof schema.providers.$inferSelect) {
  const b = await driverFor(p).balance();
  await db.update(schema.providers).set({ balance: fromMicros(toMicros(b.balance)), currency: b.currency }).where(eq(schema.providers.id, p.id));
  return b;
}

async function fetchCatalog(p: typeof schema.providers.$inferSelect): Promise<CachedProviderService[]> {
  const items = await driverFor(p).services();
  const toUsd = await usdConverter(p.currency);
  const cached = items.map((i) => ({ ...i, rateUsd: toUsd(i.rate) }));
  await connection.set(providerCatalogKey(p.id), JSON.stringify({ fetchedAt: new Date().toISOString(), items: cached }), "EX", 24 * 3600);
  return cached;
}

/**
 * Sync: refresh the provider's list, update cost/limits of services we imported,
 * disable services the provider removed, then reprice with the commission engine.
 */
async function sync(p: typeof schema.providers.$inferSelect) {
  await refreshBalance(p).catch((e) => logger.warn({ provider: p.id, err: String(e) }, "balance refresh failed"));
  const fresh = await loadProvider(p.id); // currency may have changed
  const items = await fetchCatalog(fresh);
  const byId = new Map(items.map((i) => [i.service, i]));

  const ours = await db.select().from(schema.services).where(and(eq(schema.services.providerId, p.id), eq(schema.services.mode, "auto")));
  let updated = 0;
  let disabled = 0;
  const changes: (typeof schema.priceChanges.$inferInsert)[] = [];

  for (const s of ours) {
    const item = s.providerServiceId ? byId.get(s.providerServiceId) : undefined;
    if (!item) {
      if (s.status === "active") {
        await db.update(schema.services).set({ status: "disabled" }).where(eq(schema.services.id, s.id));
        disabled++;
      }
      continue;
    }
    const patch: Partial<typeof schema.services.$inferInsert> = {};
    if (item.rateUsd !== s.providerRate) {
      patch.providerRate = item.rateUsd;
      changes.push({ serviceId: s.id, scope: "service", scopeId: s.id, field: "provider_rate", source: "sync", oldValue: s.providerRate, newValue: item.rateUsd });
    }
    if (item.min !== s.minQty) patch.minQty = item.min;
    if (item.max !== s.maxQty) patch.maxQty = item.max;
    if (item.refill !== s.refill) patch.refill = item.refill;
    if (item.cancel !== s.cancel) patch.cancel = item.cancel;
    if (item.dripfeed !== s.dripfeed) patch.dripfeed = item.dripfeed;
    if (!s.keepCustomName && item.name !== s.name) patch.name = item.name.slice(0, 255);
    if (Object.keys(patch).length) {
      await db.update(schema.services).set(patch).where(eq(schema.services.id, s.id));
      updated++;
    }
  }
  if (changes.length) await db.insert(schema.priceChanges).values(changes);
  const repriced = await recomputeSellRates(db, { providerId: p.id });
  await db.update(schema.providers).set({ lastSyncAt: new Date(), errorCount: 0, lastError: null }).where(eq(schema.providers.id, p.id));
  if (updated || disabled || repriced) await invalidateCatalog();
  logger.info({ provider: p.id, items: items.length, updated, disabled, repriced }, "provider synced");
  return { items: items.length, updated, disabled, repriced };
}

export async function runProviderJob(job: ProviderJob) {
  const p = await loadProvider(job.providerId);
  try {
    switch (job.kind) {
      case "test":
      case "balance": {
        const b = await refreshBalance(p);
        await db.update(schema.providers).set({ errorCount: 0, lastError: null }).where(eq(schema.providers.id, p.id));
        return b;
      }
      case "fetch": {
        await refreshBalance(p).catch(() => null);
        const items = await fetchCatalog(await loadProvider(p.id));
        return { count: items.length };
      }
      case "sync":
        return await sync(p);
    }
  } catch (err) {
    await recordError(p.id, err);
    throw err;
  }
}

/** Queues a sync for every provider whose interval has passed. Runs every 10 minutes. */
export async function scheduleDueSyncs(add: (id: number) => Promise<unknown>) {
  const due = await db
    .select({ id: schema.providers.id })
    .from(schema.providers)
    .where(
      and(
        eq(schema.providers.status, "active"),
        eq(schema.providers.syncEnabled, true),
        sql`(${schema.providers.lastSyncAt} IS NULL OR ${schema.providers.lastSyncAt} < NOW() - INTERVAL ${schema.providers.syncIntervalMin} MINUTE)`,
      ),
    );
  for (const p of due) await add(p.id);
  return { queued: due.length };
}


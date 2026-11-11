import { Router } from "express";
import { z } from "zod";
import { and, count, eq, inArray, maskSecret, recomputeSellRates, schema, sql } from "@smm/db";
import { applyMarkup, guessPlatform, providerInputSchema, slugify, type ProviderServiceItem } from "@smm/shared";
import { getSetting } from "../../lib/settings";
import { db } from "../../lib/db";
import { redis } from "../../lib/redis";
import { decrypt, encrypt } from "../../lib/crypto";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { runProviderJob } from "../../lib/queues";
import { parse } from "../../middleware/validate";
import { invalidateCatalog } from "../../services/catalog";
import { audit } from "../../services/audit";

export const providersRouter = Router();

type Cached = { fetchedAt: string; items: (ProviderServiceItem & { rateUsd: string })[] };
const catalogKey = (id: number) => `provider:${id}:catalog`;
const idParam = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
};

async function getProvider(id: number) {
  const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, id)).limit(1);
  if (!p) throw notFound("Provider not found");
  return p;
}

function present(p: typeof schema.providers.$inferSelect, serviceCount = 0) {
  let keyHint = "••••";
  try {
    keyHint = maskSecret(decrypt(p.apiKeyEnc));
  } catch {}
  const { apiKeyEnc: _omit, ...rest } = p;
  return { ...rest, keyHint, serviceCount };
}

providersRouter.get("/", async (_req, res) => {
  const [rows, counts] = await Promise.all([
    db.select().from(schema.providers).orderBy(schema.providers.id),
    db.select({ providerId: schema.services.providerId, n: count() }).from(schema.services).groupBy(schema.services.providerId),
  ]);
  const byProvider = new Map(counts.map((c) => [c.providerId, c.n]));
  res.json(rows.map((p) => present(p, byProvider.get(p.id) ?? 0)));
});

providersRouter.get("/:id", async (req, res) => {
  const p = await getProvider(idParam(req.params.id));
  res.json(present(p));
});

providersRouter.post("/", async (req, res) => {
  const input = parse(providerInputSchema, req.body);
  if (!input.apiKey) throw badRequest("Please check the highlighted fields", { apiKey: "Paste the provider's API key" });
  const [r] = await db.insert(schema.providers).values({
    name: input.name,
    apiUrl: input.apiUrl,
    apiKeyEnc: encrypt(input.apiKey),
    driver: input.driver,
    driverConfig: input.driver === "custom" ? (input.driverConfig ?? {}) : null,
    status: input.status,
    syncEnabled: input.syncEnabled,
    syncIntervalMin: input.syncIntervalMin,
    lowBalanceAlert: input.lowBalanceAlert ?? null,
  });
  const id = Number(r.insertId);
  await audit(req, "provider.create", "provider", id, { name: input.name });
  res.status(201).json(present(await getProvider(id)));
});

providersRouter.patch("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  await getProvider(id);
  const input = parse(providerInputSchema.partial(), req.body);
  const { apiKey, driverConfig, ...rest } = input;
  await db
    .update(schema.providers)
    .set({
      ...rest,
      ...(apiKey ? { apiKeyEnc: encrypt(apiKey) } : {}),
      ...(driverConfig !== undefined ? { driverConfig } : {}),
    })
    .where(eq(schema.providers.id, id));
  if (rest.status === "disabled") {
    // Hide its services from customers right away.
    await db.update(schema.services).set({ status: "disabled" }).where(eq(schema.services.providerId, id));
    await invalidateCatalog();
  }
  await audit(req, "provider.update", "provider", id, { ...rest, apiKeyChanged: Boolean(apiKey) });
  res.json(present(await getProvider(id)));
});

providersRouter.delete("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  await getProvider(id);
  const [{ n }] = (await db.select({ n: count() }).from(schema.orders).where(eq(schema.orders.providerId, id))) as [{ n: number }];
  if (n > 0) throw conflict("This provider has orders, so it can't be deleted. Disable it instead.");
  await db.delete(schema.services).where(eq(schema.services.providerId, id));
  await db.delete(schema.providers).where(eq(schema.providers.id, id));
  await redis.del(catalogKey(id));
  await invalidateCatalog();
  await audit(req, "provider.delete", "provider", id);
  res.json({ ok: true });
});

/** Checks the key by asking the provider for its balance (done by a worker). */
providersRouter.post("/:id/test", async (req, res) => {
  const id = idParam(req.params.id);
  await getProvider(id);
  const result = await runProviderJob<{ balance: string; currency: string }>({ kind: "test", providerId: id });
  res.json({ ok: true, ...result });
});

providersRouter.post("/:id/sync", async (req, res) => {
  const id = idParam(req.params.id);
  await getProvider(id);
  const result = await runProviderJob<{ items: number; updated: number; disabled: number; repriced: number }>(
    { kind: "sync", providerId: id },
    90_000,
  );
  await audit(req, "provider.sync", "provider", id, result);
  res.json({ ok: true, ...result });
});

/**
 * The provider's service list for the import wizard. Served from the worker's cache;
 * `refresh=1` asks the worker to download it again.
 */
providersRouter.get("/:id/catalog", async (req, res) => {
  const id = idParam(req.params.id);
  const provider = await getProvider(id);
  let raw = await redis.get(catalogKey(id));
  if (!raw || req.query.refresh === "1") {
    await runProviderJob({ kind: "fetch", providerId: id }, 90_000);
    raw = await redis.get(catalogKey(id));
  }
  const cached: Cached = raw ? JSON.parse(raw) : { fetchedAt: null, items: [] };
  const imported = await db
    .select({ id: schema.services.id, providerServiceId: schema.services.providerServiceId })
    .from(schema.services)
    .where(eq(schema.services.providerId, id));
  const importedMap = Object.fromEntries(imported.map((s) => [s.providerServiceId, s.id]));
  // Price preview at the provider's (or global) commission — computed here, never in the browser.
  const markup = provider.markup ?? String(await getSetting("pricing.globalMarkup", "20"));
  res.set("Cache-Control", "private, no-store");
  res.json({
    fetchedAt: cached.fetchedAt,
    markup,
    currency: provider.currency,
    items: cached.items.map((i) => ({ ...i, sellPreview: applyMarkup(i.rateUsd, markup), importedAs: importedMap[i.service] ?? null })),
  });
});

const importSchema = z.object({
  items: z
    .array(
      z.object({
        service: z.string().min(1).max(64),
        name: z.string().trim().min(2).max(255).optional(),
        categoryId: z.number().int().positive().optional(),
        categoryName: z.string().trim().min(2).max(120).optional(),
      }),
    )
    .min(1, "Select at least one service")
    .max(2000, "Import up to 2,000 services at a time"),
  /** When no category is chosen, use the provider's own category name. */
  keepProviderCategories: z.boolean().default(true),
});

/** Imports selected provider services; prices come out of the commission engine. */
providersRouter.post("/:id/import", async (req, res) => {
  const id = idParam(req.params.id);
  await getProvider(id);
  const input = parse(importSchema, req.body);
  const raw = await redis.get(catalogKey(id));
  if (!raw) throw conflict("Load the provider's service list first, then import.");
  const cached: Cached = JSON.parse(raw);
  const byId = new Map(cached.items.map((i) => [i.service, i]));

  const existing = await db
    .select({ providerServiceId: schema.services.providerServiceId })
    .from(schema.services)
    .where(and(eq(schema.services.providerId, id), inArray(schema.services.providerServiceId, input.items.map((i) => i.service))));
  const already = new Set(existing.map((e) => e.providerServiceId));

  // Resolve categories (create missing ones by name, matching existing names case-insensitively).
  const cats = await db.select({ id: schema.categories.id, name: schema.categories.name, slug: schema.categories.slug }).from(schema.categories);
  const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
  const slugs = new Set(cats.map((c) => c.slug));
  const [{ maxSort }] = (await db.select({ maxSort: sql<number>`COALESCE(MAX(${schema.categories.sort}), 0)` }).from(schema.categories)) as [{ maxSort: number }];
  let sort = Number(maxSort);

  async function categoryFor(name: string) {
    const hit = byName.get(name.toLowerCase());
    if (hit) return hit;
    let slug = slugify(name);
    for (let n = 2; slugs.has(slug); n++) slug = `${slugify(name)}-${n}`;
    slugs.add(slug);
    const [r] = await db.insert(schema.categories).values({ name, slug, platform: guessPlatform(name), sort: ++sort });
    const newId = Number(r.insertId);
    byName.set(name.toLowerCase(), newId);
    return newId;
  }

  const rows: (typeof schema.services.$inferInsert)[] = [];
  let skipped = 0;
  for (const sel of input.items) {
    const item = byId.get(sel.service);
    if (!item || already.has(sel.service)) {
      skipped++;
      continue;
    }
    const categoryId = sel.categoryId ?? (await categoryFor(sel.categoryName ?? (input.keepProviderCategories ? item.category : "Imported")));
    rows.push({
      categoryId,
      name: (sel.name ?? item.name).slice(0, 255),
      description: item.description,
      type: item.type,
      mode: "auto",
      providerId: id,
      providerServiceId: item.service,
      providerRate: item.rateUsd,
      sellRate: item.rateUsd, // replaced by recompute below
      minQty: item.min,
      maxQty: Math.max(item.min, item.max),
      refill: item.refill,
      cancel: item.cancel,
      dripfeed: item.dripfeed,
      keepCustomName: Boolean(sel.name && sel.name !== item.name),
      sort: rows.length,
    });
  }
  for (let i = 0; i < rows.length; i += 500) await db.insert(schema.services).values(rows.slice(i, i + 500));
  const repriced = rows.length ? await recomputeSellRates(db, { providerId: id }) : 0;
  await invalidateCatalog();
  await audit(req, "provider.import", "provider", id, { imported: rows.length, skipped });
  res.json({ ok: true, imported: rows.length, skipped, repriced });
});

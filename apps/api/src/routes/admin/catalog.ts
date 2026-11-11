import { Router } from "express";
import { z } from "zod";
import { and, asc, count, desc, eq, gt, inArray, like, or, recomputeSellRates, schema, sql, type SQL } from "@smm/db";
import { categoryInputSchema, markupSchema, serviceInputSchema, slugify } from "@smm/shared";
import { db } from "../../lib/db";
import { redis } from "../../lib/redis";
import { conflict, notFound } from "../../lib/errors";
import { parse } from "../../middleware/validate";
import { invalidateCatalog } from "../../services/catalog";
import { audit } from "../../services/audit";

export const categoriesRouter = Router();
export const servicesRouter = Router();

const idParam = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
};

/* ───────────── Categories ───────────── */

categoriesRouter.get("/", async (_req, res) => {
  const [rows, counts] = await Promise.all([
    db.select().from(schema.categories).orderBy(asc(schema.categories.sort), asc(schema.categories.id)),
    db
      .select({ categoryId: schema.services.categoryId, n: count(), active: sql<number>`SUM(${schema.services.status} = 'active')` })
      .from(schema.services)
      .groupBy(schema.services.categoryId),
  ]);
  const byCat = new Map(counts.map((c) => [c.categoryId, c]));
  res.json(rows.map((c) => ({ ...c, serviceCount: byCat.get(c.id)?.n ?? 0, activeCount: Number(byCat.get(c.id)?.active ?? 0) })));
});

async function uniqueSlug(name: string, exceptId?: number) {
  const base = slugify(name);
  const rows = await db.select({ id: schema.categories.id, slug: schema.categories.slug }).from(schema.categories).where(like(schema.categories.slug, `${base}%`));
  const taken = new Set(rows.filter((r) => r.id !== exceptId).map((r) => r.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

categoriesRouter.post("/", async (req, res) => {
  const input = parse(categoryInputSchema, req.body);
  const [{ maxSort }] = (await db.select({ maxSort: sql<number>`COALESCE(MAX(${schema.categories.sort}), 0)` }).from(schema.categories)) as [{ maxSort: number }];
  const [r] = await db.insert(schema.categories).values({ ...input, slug: await uniqueSlug(input.name), sort: Number(maxSort) + 1 });
  await invalidateCatalog();
  await audit(req, "category.create", "category", Number(r.insertId), { name: input.name });
  res.status(201).json({ ok: true, id: Number(r.insertId) });
});

categoriesRouter.patch("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const input = parse(categoryInputSchema.partial(), req.body);
  const patch: Record<string, unknown> = { ...input };
  if (input.name) patch.slug = await uniqueSlug(input.name, id);
  const [r] = await db.update(schema.categories).set(patch).where(eq(schema.categories.id, id));
  if (!r.affectedRows) throw notFound("Category not found");
  await invalidateCatalog();
  await audit(req, "category.update", "category", id, input);
  res.json({ ok: true });
});

categoriesRouter.post("/reorder", async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int().positive()).min(1).max(5000) }), req.body);
  const cases = sql.join(ids.map((id, i) => sql`WHEN ${id} THEN ${i}`), sql` `);
  await db.update(schema.categories).set({ sort: sql`CASE ${schema.categories.id} ${cases} END` }).where(inArray(schema.categories.id, ids));
  await invalidateCatalog();
  res.json({ ok: true });
});

categoriesRouter.delete("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const [{ n }] = (await db.select({ n: count() }).from(schema.services).where(eq(schema.services.categoryId, id))) as [{ n: number }];
  if (n > 0) throw conflict(`This category still has ${n} service${n === 1 ? "" : "s"}. Move or delete ${n === 1 ? "it" : "them"} first.`);
  await db.delete(schema.categories).where(eq(schema.categories.id, id));
  await invalidateCatalog();
  await audit(req, "category.delete", "category", id);
  res.json({ ok: true });
});

/* ───────────── Services ───────────── */

const listQuery = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().trim().max(120).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  providerId: z.coerce.number().int().positive().optional(),
  status: z.enum(["active", "disabled"]).optional(),
  mode: z.enum(["auto", "manual"]).optional(),
});

/** Cursor-paginated (by id) admin service list with cost, price and profit. */
servicesRouter.get("/", async (req, res) => {
  const q = parse(listQuery, req.query);
  const conds: SQL[] = [gt(schema.services.id, q.cursor)];
  if (q.categoryId) conds.push(eq(schema.services.categoryId, q.categoryId));
  if (q.providerId) conds.push(eq(schema.services.providerId, q.providerId));
  if (q.status) conds.push(eq(schema.services.status, q.status));
  if (q.mode) conds.push(eq(schema.services.mode, q.mode));
  if (q.q) {
    const term = `%${q.q.replace(/[%_]/g, "\\$&")}%`;
    const num = Number(q.q);
    conds.push(
      or(like(schema.services.name, term), like(schema.services.providerServiceId, term), ...(Number.isInteger(num) ? [eq(schema.services.id, num)] : []))!,
    );
  }
  const rows = await db
    .select({
      s: schema.services,
      categoryName: schema.categories.name,
      categoryMarkup: schema.categories.markup,
      providerName: schema.providers.name,
      providerMarkup: schema.providers.markup,
    })
    .from(schema.services)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.services.categoryId))
    .leftJoin(schema.providers, eq(schema.providers.id, schema.services.providerId))
    .where(and(...conds))
    .orderBy(asc(schema.services.id))
    .limit(q.limit + 1);

  const page = rows.slice(0, q.limit);
  res.json({
    items: page.map(({ s, ...r }) => ({
      ...s,
      ...r,
      markupSource: s.mode === "manual" ? "manual" : s.markup !== null ? "service" : r.categoryMarkup !== null ? "category" : r.providerMarkup !== null ? "provider" : "global",
      profit: s.providerRate ? (Number(s.sellRate) - Number(s.providerRate)).toFixed(6) : null,
    })),
    nextCursor: rows.length > q.limit ? page[page.length - 1]!.s.id : null,
  });
});

servicesRouter.get("/:id/history", async (req, res) => {
  const id = idParam(req.params.id);
  const rows = await db.select().from(schema.priceChanges).where(eq(schema.priceChanges.serviceId, id)).orderBy(desc(schema.priceChanges.id)).limit(50);
  res.json(rows);
});

async function providerRateFor(providerId: number, providerServiceId: string) {
  const raw = await redis.get(`provider:${providerId}:catalog`);
  if (!raw) return null;
  const item = (JSON.parse(raw).items as { service: string; rateUsd: string }[]).find((i) => i.service === providerServiceId);
  return item?.rateUsd ?? null;
}

servicesRouter.post("/", async (req, res) => {
  const input = parse(serviceInputSchema, req.body);
  let providerRate: string | null = null;
  if (input.mode === "auto") {
    providerRate = await providerRateFor(input.providerId!, input.providerServiceId!);
    if (!providerRate) throw conflict("That service ID isn't in the provider's list. Load the list in the import screen first.");
  }
  const [r] = await db.insert(schema.services).values({
    ...input,
    providerId: input.mode === "auto" ? input.providerId! : null,
    providerServiceId: input.mode === "auto" ? input.providerServiceId! : null,
    providerRate,
    sellRate: input.mode === "manual" ? input.sellRate! : providerRate!,
    keepCustomName: true,
  });
  const id = Number(r.insertId);
  if (input.mode === "auto") await recomputeSellRates(db, { serviceIds: [id] });
  await invalidateCatalog();
  await audit(req, "service.create", "service", id, { name: input.name, mode: input.mode });
  res.status(201).json({ ok: true, id });
});

servicesRouter.patch("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const [current] = await db.select().from(schema.services).where(eq(schema.services.id, id)).limit(1);
  if (!current) throw notFound("Service not found");
  const input = parse(
    z.object({
      categoryId: z.number().int().positive().optional(),
      name: z.string().trim().min(2).max(255).optional(),
      description: z.string().max(5000).nullable().optional(),
      sellRate: z.string().regex(/^\d+(\.\d{1,6})?$/).optional(),
      markup: markupSchema.optional(),
      minQty: z.number().int().min(1).optional(),
      maxQty: z.number().int().min(1).optional(),
      refill: z.boolean().optional(),
      refillDays: z.number().int().min(0).max(3650).optional(),
      cancel: z.boolean().optional(),
      dripfeed: z.boolean().optional(),
      badges: z.array(z.string().trim().min(1).max(24)).max(5).optional(),
      status: z.enum(["active", "disabled"]).optional(),
      backupProviderId: z.number().int().positive().nullable().optional(),
      backupProviderServiceId: z.string().max(64).nullable().optional(),
    }),
    req.body,
  );
  const patch: Partial<typeof schema.services.$inferInsert> = { ...input };
  if (current.mode === "auto") delete patch.sellRate; // auto prices come from the commission engine
  if (input.name && input.name !== current.name) patch.keepCustomName = true;
  if ((input.maxQty ?? current.maxQty) < (input.minQty ?? current.minQty))
    throw conflict("Max must be at least the min", { maxQty: "Max must be at least the min" });
  await db.update(schema.services).set(patch).where(eq(schema.services.id, id));
  if (input.markup !== undefined && current.mode === "auto") {
    await db.insert(schema.priceChanges).values({ serviceId: id, scope: "service", scopeId: id, field: "markup", source: "admin", oldValue: current.markup, newValue: input.markup, actorId: req.auth!.userId });
    await recomputeSellRates(db, { serviceIds: [id] });
  }
  if (input.sellRate && current.mode === "manual" && input.sellRate !== current.sellRate)
    await db.insert(schema.priceChanges).values({ serviceId: id, scope: "service", scopeId: id, field: "sell_rate", source: "admin", oldValue: current.sellRate, newValue: input.sellRate, actorId: req.auth!.userId });
  await invalidateCatalog();
  await audit(req, "service.update", "service", id, input);
  res.json({ ok: true });
});

servicesRouter.post("/bulk", async (req, res) => {
  const input = parse(
    z.object({
      ids: z.array(z.number().int().positive()).min(1).max(5000),
      action: z.enum(["enable", "disable", "delete", "move", "markup"]),
      categoryId: z.number().int().positive().optional(),
      markup: markupSchema.optional(),
    }),
    req.body,
  );
  const where = inArray(schema.services.id, input.ids);
  let affected = 0;
  switch (input.action) {
    case "enable":
    case "disable":
      affected = (await db.update(schema.services).set({ status: input.action === "enable" ? "active" : "disabled" }).where(where))[0].affectedRows;
      break;
    case "move":
      if (!input.categoryId) throw conflict("Pick a category to move them to");
      affected = (await db.update(schema.services).set({ categoryId: input.categoryId }).where(where))[0].affectedRows;
      break;
    case "markup":
      if (input.markup === undefined) throw conflict("Enter a commission");
      affected = (await db.update(schema.services).set({ markup: input.markup }).where(where))[0].affectedRows;
      await recomputeSellRates(db, { serviceIds: input.ids });
      break;
    case "delete": {
      const used = await db.select({ serviceId: schema.orders.serviceId }).from(schema.orders).where(inArray(schema.orders.serviceId, input.ids)).groupBy(schema.orders.serviceId);
      const blocked = new Set(used.map((u) => u.serviceId));
      const deletable = input.ids.filter((i) => !blocked.has(i));
      if (deletable.length) affected = (await db.delete(schema.services).where(inArray(schema.services.id, deletable)))[0].affectedRows;
      if (blocked.size)
        await db.update(schema.services).set({ status: "disabled" }).where(inArray(schema.services.id, [...blocked]));
      break;
    }
  }
  await invalidateCatalog();
  await audit(req, `service.bulk.${input.action}`, "service", input.ids.join(",").slice(0, 64), { count: input.ids.length });
  res.json({ ok: true, affected });
});

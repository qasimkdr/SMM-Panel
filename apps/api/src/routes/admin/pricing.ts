import { Router } from "express";
import { z } from "zod";
import { asc, eq, recomputeSellRates, schema, sql } from "@smm/db";
import { applyMarkup, markupSchema, profitOf } from "@smm/shared";
import { db } from "../../lib/db";
import { notFound } from "../../lib/errors";
import { getSetting, invalidateSettings } from "../../lib/settings";
import { parse } from "../../middleware/validate";
import { invalidateCatalog } from "../../services/catalog";
import { audit } from "../../services/audit";

/**
 * Commission control. The admin pastes a number (e.g. "25") and it is treated as 25 %.
 * Priority: service > category > provider > global. All maths happens here, never in the browser.
 */
export const pricingRouter = Router();

const body = z.object({ markup: markupSchema });

pricingRouter.get("/", async (_req, res) => {
  const [global, providers, categories] = await Promise.all([
    getSetting("pricing.globalMarkup", "20"),
    db.select({ id: schema.providers.id, name: schema.providers.name, markup: schema.providers.markup }).from(schema.providers),
    db
      .select({ id: schema.categories.id, name: schema.categories.name, markup: schema.categories.markup })
      .from(schema.categories)
      .orderBy(asc(schema.categories.sort)),
  ]);
  res.json({ globalMarkup: String(global), providers, categories });
});

pricingRouter.post("/preview", (req, res) => {
  const input = parse(z.object({ providerRate: z.string().regex(/^\d+(\.\d+)?$/), markup: markupSchema }), req.body);
  const sell = applyMarkup(input.providerRate, input.markup ?? "0");
  res.json({ providerRate: input.providerRate, markup: input.markup, sellRate: sell, profitPer1000: profitOf(sell, input.providerRate) });
});

async function logChange(
  scope: "global" | "provider" | "category" | "service",
  scopeId: number | null,
  oldValue: string | null,
  newValue: string | null,
  actorId: number,
) {
  await db.insert(schema.priceChanges).values({
    scope,
    scopeId,
    serviceId: scope === "service" ? scopeId : null,
    field: "markup",
    source: "admin",
    oldValue,
    newValue,
    actorId,
  });
}

pricingRouter.put("/global", async (req, res) => {
  const { markup } = parse(body, req.body);
  const value = markup ?? "0";
  const old = String(await getSetting("pricing.globalMarkup", "20"));
  await db
    .insert(schema.settings)
    .values({ key: "pricing.globalMarkup", value })
    .onDuplicateKeyUpdate({ set: { value: sql`VALUES(value)` } });
  await invalidateSettings();
  await logChange("global", null, old, value, req.auth!.userId);
  const changed = await recomputeSellRates(db);
  await invalidateCatalog();
  await audit(req, "pricing.global", "settings", "pricing.globalMarkup", { old, new: value, changed });
  res.json({ ok: true, markup: value, servicesRepriced: changed });
});

const levels = {
  provider: { table: schema.providers, filter: (id: number) => ({ providerId: id }) },
  category: { table: schema.categories, filter: (id: number) => ({ categoryId: id }) },
  service: { table: schema.services, filter: (id: number) => ({ serviceIds: [id] }) },
} as const;

for (const level of ["provider", "category", "service"] as const) {
  pricingRouter.put(`/${level}/:id`, async (req, res) => {
    const id = Number(req.params.id);
    const { markup } = parse(body, req.body); // null = inherit from the next level
    const { table, filter } = levels[level];
    const [row] = await db.select({ markup: table.markup }).from(table).where(eq(table.id, id)).limit(1);
    if (!row) throw notFound(`${level} not found`);
    await db.update(table).set({ markup }).where(eq(table.id, id));
    await logChange(level, id, row.markup, markup, req.auth!.userId);
    const changed = await recomputeSellRates(db, filter(id));
    await invalidateCatalog();
    await audit(req, `pricing.${level}`, level, id, { old: row.markup, new: markup, changed });
    res.json({ ok: true, markup, servicesRepriced: changed });
  });
}

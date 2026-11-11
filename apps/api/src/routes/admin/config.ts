import { Router } from "express";
import { z } from "zod";
import { asc, desc, eq, lt, and, schema, sql, type SQL } from "@smm/db";
import { announcementSchema, pageSchema, SETTINGS, validateSetting, vipTierSchema } from "@smm/shared";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { QUEUES } from "@smm/shared";
import { db } from "../../lib/db";
import { redis } from "../../lib/redis";
import { invalidate } from "../../lib/cache";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { getSettings, invalidateSettings } from "../../lib/settings";
import { env } from "../../env";
import { parse } from "../../middleware/validate";
import { audit } from "../../services/audit";
import { revalidateWeb } from "../../services/catalog";

/* ───────────── Settings ───────────── */
export const settingsRouter = Router();

settingsRouter.get("/", async (_req, res) => {
  res.json({ registry: SETTINGS, values: await getSettings() });
});

settingsRouter.put("/", async (req, res) => {
  const { values } = parse(z.object({ values: z.record(z.string(), z.unknown()) }), req.body);
  const fields: Record<string, string> = {};
  const clean: [string, unknown][] = [];
  for (const [key, value] of Object.entries(values)) {
    const def = SETTINGS.find((s) => s.key === key);
    if (!def) continue; // unknown keys are ignored, never stored
    const r = validateSetting(def, value);
    if (r.ok) clean.push([key, r.value]);
    else fields[key] = r.error;
  }
  if (Object.keys(fields).length) throw badRequest("Please check the highlighted fields", fields);
  for (const [key, value] of clean)
    await db.insert(schema.settings).values({ key, value }).onDuplicateKeyUpdate({ set: { value: sql`VALUES(value)` } });
  await invalidateSettings();
  await revalidateWeb(["/", "/services", "/api-docs"], true); // titles/name live in the root layout
  await audit(req, "settings.update", "settings", undefined, Object.fromEntries(clean));
  res.json({ ok: true, saved: clean.length });
});

/* ───────────── Currencies ───────────── */
export const currenciesRouter = Router();
let maintenanceQueue: Queue | null = null;

currenciesRouter.get("/", async (_req, res) => {
  res.json(await db.select().from(schema.currencies).orderBy(asc(schema.currencies.sort)));
});

currenciesRouter.patch("/:code", async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const input = parse(
    z.object({
      enabled: z.boolean().optional(),
      autoRate: z.boolean().optional(),
      rate: z.string().regex(/^\d{1,12}(\.\d{1,8})?$/, "Enter a rate like 278.5").optional(),
      symbol: z.string().trim().min(1).max(8).optional(),
      decimals: z.number().int().min(0).max(6).optional(),
    }),
    req.body,
  );
  if (code === "USD" && (input.enabled === false || input.rate)) throw badRequest("USD is the base currency: it stays on at a rate of 1");
  if (input.rate && Number(input.rate) <= 0) throw badRequest("Please check the highlighted fields", { rate: "Rate must be above 0" });
  // Typing a rate switches that currency to manual, so the daily update won't overwrite it.
  const patch = { ...input, ...(input.rate && input.autoRate === undefined ? { autoRate: false } : {}) };
  const [r] = await db.update(schema.currencies).set(patch).where(eq(schema.currencies.code, code));
  if (!r.affectedRows) throw notFound("Currency not found");
  await invalidate("currencies:enabled");
  await audit(req, "currency.update", "currency", code, input);
  res.json({ ok: true });
});

currenciesRouter.post("/refresh", async (req, res) => {
  maintenanceQueue ??= new Queue(QUEUES.maintenance, { connection: new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) });
  await maintenanceQueue.add("currency-rates", {}, { removeOnComplete: true, removeOnFail: 20 });
  await audit(req, "currency.refresh", "currency");
  res.json({ ok: true, queued: true });
});

/* ───────────── VIP levels ───────────── */
export const vipRouter = Router();

/** Re-assign every unlocked user to the highest level their lifetime spend reaches. One UPDATE. */
async function reassignTiers() {
  await db.execute(sql`
    UPDATE users u SET vip_tier_id = (
      SELECT t.id FROM vip_tiers t WHERE t.min_spent <= u.spent ORDER BY t.min_spent DESC LIMIT 1
    ) WHERE u.vip_locked = 0`);
  // Drop cached discounts (SCAN, never KEYS, so Redis isn't blocked).
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "user:*:discount", "COUNT", 500);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== "0");
}

vipRouter.get("/", async (_req, res) => {
  const tiers = await db.select().from(schema.vipTiers).orderBy(asc(schema.vipTiers.minSpent));
  const counts = await db.execute(sql`SELECT vip_tier_id AS id, COUNT(*) AS n FROM users GROUP BY vip_tier_id`);
  const byTier = new Map(((counts as unknown as [{ id: number | null; n: number }[]])[0] ?? []).map((c) => [c.id, Number(c.n)]));
  res.json(tiers.map((t) => ({ ...t, users: byTier.get(t.id) ?? 0 })));
});

vipRouter.post("/", async (req, res) => {
  const input = parse(vipTierSchema, req.body);
  const [r] = await db.insert(schema.vipTiers).values(input);
  await reassignTiers();
  await audit(req, "vip.create", "vip", Number(r.insertId), input);
  res.status(201).json({ ok: true, id: Number(r.insertId) });
});

vipRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const input = parse(vipTierSchema.partial(), req.body);
  await db.update(schema.vipTiers).set(input).where(eq(schema.vipTiers.id, id));
  await reassignTiers();
  await audit(req, "vip.update", "vip", id, input);
  res.json({ ok: true });
});

vipRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const all = await db.select({ id: schema.vipTiers.id }).from(schema.vipTiers);
  if (all.length <= 1) throw conflict("Keep at least one level");
  await db.update(schema.users).set({ vipTierId: null, vipLocked: false }).where(eq(schema.users.vipTierId, id));
  await db.delete(schema.vipTiers).where(eq(schema.vipTiers.id, id));
  await reassignTiers();
  await audit(req, "vip.delete", "vip", id);
  res.json({ ok: true });
});

/* ───────────── Pages & announcements ───────────── */
export const contentRouter = Router();

contentRouter.get("/pages", async (_req, res) => {
  res.json(await db.select().from(schema.pages).orderBy(asc(schema.pages.slug)));
});

contentRouter.put("/pages/:slug", async (req, res) => {
  const slug = String(req.params.slug);
  if (!/^[a-z0-9-]{2,64}$/.test(slug)) throw badRequest("Use lowercase letters, numbers and dashes for the address");
  const input = parse(pageSchema, req.body);
  await db.insert(schema.pages).values({ slug, ...input }).onDuplicateKeyUpdate({ set: input });
  await invalidate(`page:${slug}`);
  await revalidateWeb([`/${slug}`, `/p/${slug}`]);
  await audit(req, "page.update", "page", slug);
  res.json({ ok: true });
});

contentRouter.get("/announcements", async (_req, res) => {
  res.json(await db.select().from(schema.announcements).orderBy(desc(schema.announcements.id)).limit(100));
});

const toDates = (i: z.infer<typeof announcementSchema>) => ({
  ...i,
  startsAt: i.startsAt ? new Date(i.startsAt) : null,
  endsAt: i.endsAt ? new Date(i.endsAt) : null,
});

contentRouter.post("/announcements", async (req, res) => {
  const input = parse(announcementSchema, req.body);
  const [r] = await db.insert(schema.announcements).values(toDates(input));
  await invalidate("announcements:active");
  await audit(req, "announcement.create", "announcement", Number(r.insertId), { title: input.title });
  res.status(201).json({ ok: true, id: Number(r.insertId) });
});

contentRouter.put("/announcements/:id", async (req, res) => {
  const id = Number(req.params.id);
  const input = parse(announcementSchema, req.body);
  await db.update(schema.announcements).set(toDates(input)).where(eq(schema.announcements.id, id));
  await invalidate("announcements:active");
  await audit(req, "announcement.update", "announcement", id, { title: input.title });
  res.json({ ok: true });
});

contentRouter.delete("/announcements/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(schema.announcements).where(eq(schema.announcements.id, id));
  await invalidate("announcements:active");
  await audit(req, "announcement.delete", "announcement", id);
  res.json({ ok: true });
});

/* ───────────── Activity log ───────────── */
export const logsRouter = Router();

logsRouter.get("/", async (req, res) => {
  const q = parse(
    z.object({ cursor: z.coerce.number().int().positive().optional(), action: z.string().max(64).optional(), actorId: z.coerce.number().int().positive().optional() }),
    req.query,
  );
  const conds: SQL[] = [];
  if (q.cursor) conds.push(lt(schema.adminLogs.id, q.cursor));
  if (q.action) conds.push(sql`${schema.adminLogs.action} LIKE ${`${q.action}%`}`);
  if (q.actorId) conds.push(eq(schema.adminLogs.actorId, q.actorId));
  const rows = await db
    .select({ log: schema.adminLogs, username: schema.users.username })
    .from(schema.adminLogs)
    .leftJoin(schema.users, eq(schema.users.id, schema.adminLogs.actorId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.adminLogs.id))
    .limit(51);
  res.json({ items: rows.slice(0, 50).map((r) => ({ ...r.log, username: r.username })), nextCursor: rows.length > 50 ? rows[49]!.log.id : null });
});

import { Router } from "express";
import { getCatalog, personalize } from "../services/catalog";
import { getCurrencies, userDiscount } from "../services/users";
import { getSettings, PUBLIC_SETTING_KEYS } from "../lib/settings";
import { and, desc, eq, gte, isNull, lte, or, schema, sql } from "@smm/db";
import { db } from "../lib/db";
import { cached } from "../lib/cache";
import { notFound } from "../lib/errors";

export const publicRouter = Router();

publicRouter.get("/settings", async (_req, res) => {
  const all = await getSettings();
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.json(Object.fromEntries(PUBLIC_SETTING_KEYS.map((k) => [k, all[k] ?? null])));
});

publicRouter.get("/currencies", async (_req, res) => {
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  res.json(await getCurrencies());
});

/** Services list. Anonymous: public prices (CDN-cacheable). Signed in: prices with the user's discount. */
publicRouter.get("/services", async (req, res) => {
  const catalog = await getCatalog();
  if (!req.auth) {
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=600");
    res.json(catalog);
    return;
  }
  res.set("Cache-Control", "private, max-age=30");
  res.json(personalize(catalog, await userDiscount(req.auth.userId)));
});

publicRouter.get("/pages/:slug", async (req, res) => {
  const slug = String(req.params.slug);
  const page = await cached(`page:${slug}`, 3600, async () => {
    const [p] = await db.select().from(schema.pages).where(and(eq(schema.pages.slug, slug), eq(schema.pages.published, true))).limit(1);
    return p ?? null;
  });
  if (!page) throw notFound("Page not found");
  res.set("Cache-Control", "public, max-age=300");
  res.json(page);
});

/** Active announcements (time window applied at read time; cached 60 s). */
publicRouter.get("/announcements", async (_req, res) => {
  const rows = await cached("announcements:active", 60, () =>
    db
      .select({ id: schema.announcements.id, title: schema.announcements.title, body: schema.announcements.body, kind: schema.announcements.kind, createdAt: schema.announcements.createdAt })
      .from(schema.announcements)
      .where(
        and(
          eq(schema.announcements.active, true),
          or(isNull(schema.announcements.startsAt), lte(schema.announcements.startsAt, sql`NOW()`)),
          or(isNull(schema.announcements.endsAt), gte(schema.announcements.endsAt, sql`NOW()`)),
        ),
      )
      .orderBy(desc(schema.announcements.id))
      .limit(20),
  );
  res.set("Cache-Control", "public, max-age=60");
  res.json(rows);
});

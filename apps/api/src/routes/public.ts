import { Router } from "express";
import { getCatalog, personalize } from "../services/catalog";
import { getCurrencies, userDiscount } from "../services/users";
import { getSettings, PUBLIC_SETTING_KEYS } from "../lib/settings";

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

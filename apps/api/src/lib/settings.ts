import { schema } from "@smm/db";
import { db } from "./db";
import { cached, invalidate } from "./cache";

const KEY = "settings:all";

/** All admin-controlled settings, cached in Redis (invalidated on admin save). */
export async function getSettings(): Promise<Record<string, unknown>> {
  return cached(KEY, 3600, async () => {
    const rows = await db.select().from(schema.settings);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const all = await getSettings();
  return (all[key] as T | undefined) ?? fallback;
}

export const invalidateSettings = () => invalidate(KEY);

/** Keys that are safe to expose to the public site. */
export const PUBLIC_SETTING_KEYS = [
  "site.name",
  "site.tagline",
  "site.brandColor",
  "site.defaultTheme",
  "site.maintenance",
  "currency.default",
  "auth.registrationOpen",
  "auth.googleEnabled",
  "features.affiliates",
  "features.childPanels",
  "features.api",
  "features.addFunds",
  "orders.massOrderEnabled",
  "orders.dripfeedEnabled",
  "seo.defaultTitle",
  "seo.defaultDescription",
];

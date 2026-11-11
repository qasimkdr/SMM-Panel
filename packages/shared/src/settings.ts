import { z } from "zod";

/**
 * Every admin-editable setting, in one registry. The admin Settings page renders from this,
 * and the API validates against it — adding a setting = adding one entry here.
 */
export type SettingKind = "text" | "textarea" | "boolean" | "number" | "percent" | "money" | "select" | "color";

export interface SettingDef {
  key: string;
  group: "General" | "Sign-up & security" | "Orders" | "Features" | "Affiliates" | "Child panels" | "SEO";
  label: string;
  help?: string;
  kind: SettingKind;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  public?: boolean;
}

export const SETTINGS: SettingDef[] = [
  { key: "site.name", group: "General", label: "Panel name", kind: "text", public: true, help: "Shown in the header, emails and page titles." },
  { key: "site.tagline", group: "General", label: "Tagline", kind: "text", public: true },
  { key: "site.brandColor", group: "General", label: "Brand color", kind: "color", public: true, help: "Used in emails. The site theme uses the design system accent." },
  {
    key: "site.defaultTheme",
    group: "General",
    label: "Default theme",
    kind: "select",
    public: true,
    options: [
      { value: "system", label: "Follow the visitor's device" },
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ],
  },
  { key: "site.maintenance", group: "General", label: "Maintenance mode", kind: "boolean", public: true, help: "Customers see a maintenance notice and can't place orders. Admins can still sign in." },
  { key: "currency.default", group: "General", label: "Default currency for new visitors", kind: "text", public: true, help: "A 3-letter code, e.g. USD or PKR." },

  { key: "auth.registrationOpen", group: "Sign-up & security", label: "Allow new sign-ups", kind: "boolean", public: true },
  { key: "auth.requireEmailVerification", group: "Sign-up & security", label: "Require email confirmation before ordering", kind: "boolean" },
  { key: "auth.googleEnabled", group: "Sign-up & security", label: "Sign in with Google", kind: "boolean", public: true, help: "Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server's environment." },

  { key: "orders.blockDuplicateActive", group: "Orders", label: "Block a second active order for the same link and service", kind: "boolean" },
  { key: "orders.massOrderEnabled", group: "Orders", label: "Mass orders", kind: "boolean", public: true },
  { key: "orders.dripfeedEnabled", group: "Orders", label: "Drip-feed", kind: "boolean", public: true },
  { key: "pricing.roundingDecimals", group: "Orders", label: "Price decimals shown", kind: "number", min: 2, max: 6 },

  { key: "features.api", group: "Features", label: "Reseller API (/api/v2)", kind: "boolean", public: true },
  { key: "features.affiliates", group: "Features", label: "Affiliate program", kind: "boolean", public: true },
  { key: "features.childPanels", group: "Features", label: "Child panels", kind: "boolean", public: true },
  { key: "features.addFunds", group: "Features", label: "Add funds page", kind: "boolean", public: true, help: "Off shows \"Coming soon\" until payment methods are connected." },

  { key: "affiliate.commissionPercent", group: "Affiliates", label: "Commission on referred spend", kind: "percent", help: "Type a number; it's a percentage." },
  { key: "affiliate.minPayout", group: "Affiliates", label: "Minimum payout (USD)", kind: "money" },
  { key: "affiliate.cookieDays", group: "Affiliates", label: "Referral cookie (days)", kind: "number", min: 1, max: 365 },

  { key: "childPanel.monthlyPrice", group: "Child panels", label: "Monthly price (USD)", kind: "money" },

  { key: "seo.defaultTitle", group: "SEO", label: "Home page title", kind: "text", public: true, help: "About 50–60 characters." },
  { key: "seo.defaultDescription", group: "SEO", label: "Meta description", kind: "textarea", public: true, help: "About 140–160 characters. Shown in search results." },
  { key: "seo.headCode", group: "SEO", label: "Extra <head> code", kind: "textarea", help: "Analytics or verification tags. Only add code you trust." },
];

export const SETTING_KEYS = new Set(SETTINGS.map((s) => s.key));
export const PUBLIC_SETTINGS = SETTINGS.filter((s) => s.public).map((s) => s.key);

/** Validates one value for its setting; returns the normalized value or an error message. */
export function validateSetting(def: SettingDef, value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  switch (def.kind) {
    case "boolean":
      return typeof value === "boolean" ? { ok: true, value } : { ok: false, error: "Choose on or off" };
    case "number": {
      const n = Number(value);
      if (!Number.isInteger(n)) return { ok: false, error: "Enter a whole number" };
      if ((def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max)) return { ok: false, error: `Use ${def.min}–${def.max}` };
      return { ok: true, value: n };
    }
    case "percent":
    case "money": {
      const s = String(value ?? "").trim().replace(/%$/, "");
      return /^\d{1,7}(\.\d{1,4})?$/.test(s) ? { ok: true, value: s } : { ok: false, error: def.kind === "percent" ? "Enter a percentage like 5 or 7.5" : "Enter an amount like 10 or 9.99" };
    }
    case "color":
      return /^#[0-9a-f]{6}$/i.test(String(value)) ? { ok: true, value: String(value).toLowerCase() } : { ok: false, error: "Use a hex color like #c4461c" };
    case "select":
      return def.options?.some((o) => o.value === value) ? { ok: true, value } : { ok: false, error: "Pick one of the options" };
    case "textarea":
    case "text": {
      const s = String(value ?? "");
      const max = def.kind === "text" ? 200 : 20_000;
      if (s.length > max) return { ok: false, error: `Keep it under ${max} characters` };
      if (def.key === "currency.default" && !/^[A-Z]{3}$/.test(s)) return { ok: false, error: "Use a 3-letter currency code" };
      if (def.key === "site.name" && s.trim().length < 2) return { ok: false, error: "Enter a name" };
      return { ok: true, value: def.kind === "text" ? s.trim() : s };
    }
  }
}

/** Staff permissions. Admins have all of them. */
export const PERMISSIONS = [
  { value: "orders", label: "Orders" },
  { value: "users", label: "Users and balances" },
  { value: "catalog", label: "Providers, services and categories" },
  { value: "pricing", label: "Commission and VIP levels" },
  { value: "content", label: "Pages and announcements" },
  { value: "settings", label: "Settings and currencies" },
  { value: "logs", label: "Activity log" },
] as const;
export type Permission = (typeof PERMISSIONS)[number]["value"];

export const vipTierSchema = z.object({
  name: z.string().trim().min(2, "Name the level").max(48),
  minSpent: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter an amount like 100"),
  discount: z.string().regex(/^\d{1,2}(\.\d{1,2})?$/, "Enter a percentage like 2 or 2.5"),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Use a hex color"),
});

export const announcementSchema = z.object({
  title: z.string().trim().min(2, "Add a title").max(160),
  body: z.string().trim().min(1, "Add a message").max(5000),
  kind: z.enum(["banner", "popup", "news"]),
  active: z.boolean(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

export const pageSchema = z.object({
  title: z.string().trim().min(2).max(160),
  content: z.string().max(100_000),
  metaTitle: z.string().max(160).nullable().optional(),
  metaDescription: z.string().max(320).nullable().optional(),
  published: z.boolean(),
});

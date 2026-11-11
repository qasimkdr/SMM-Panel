import { z } from "zod";
import { SERVICE_TYPES, type ServiceType } from "./constants";

export const QUEUES = {
  orders: "orders",
  orderStatus: "order-status",
  provider: "provider",
  maintenance: "maintenance",
} as const;

/** A service as returned by a provider, normalized (rates still in the provider's currency). */
export interface ProviderServiceItem {
  service: string;
  name: string;
  type: ServiceType;
  category: string;
  rate: string;
  min: number;
  max: number;
  refill: boolean;
  cancel: boolean;
  dripfeed: boolean;
  description: string | null;
}

export type ProviderJob =
  | { kind: "test"; providerId: number }
  | { kind: "fetch"; providerId: number }
  | { kind: "balance"; providerId: number }
  | { kind: "sync"; providerId: number };

/** "Custom Comments Package" -> "custom_comments_package"; unknown -> "default". */
export function normalizeServiceType(raw: unknown): ServiceType {
  const s = String(raw ?? "default")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return (SERVICE_TYPES as readonly string[]).includes(s) ? (s as ServiceType) : "default";
}

/**
 * Settings for providers whose API isn't standard v2 ("v3"/custom).
 * Everything has a v2-compatible default, so admins only change what differs.
 */
export const customDriverConfigSchema = z.object({
  method: z.enum(["POST", "GET"]).default("POST"),
  bodyType: z.enum(["form", "json"]).default("form"),
  auth: z
    .object({
      in: z.enum(["body", "header", "query"]).default("body"),
      name: z.string().min(1).max(64).default("key"),
      prefix: z.string().max(32).default(""), // e.g. "Bearer "
    })
    .default({ in: "body", name: "key", prefix: "" }),
  actionField: z.string().max(64).default("action"),
  /** Our action name -> provider's action name. */
  actions: z.record(z.string(), z.string()).default({}),
  /** Our request field -> provider's field (e.g. { quantity: "qty" }). */
  requestFields: z.record(z.string(), z.string()).default({}),
  /** Our response field -> provider's field (e.g. { rate: "price", service: "id" }). */
  responseFields: z.record(z.string(), z.string()).default({}),
  /** Dot path to the services array if it's wrapped, e.g. "data.services". */
  servicesPath: z.string().max(128).default(""),
  /** Provider status text -> ours. */
  statusMap: z.record(z.string(), z.string()).default({}),
  extraHeaders: z.record(z.string(), z.string()).default({}),
});
export type CustomDriverConfig = z.infer<typeof customDriverConfigSchema>;

export const providerInputSchema = z.object({
  name: z.string().trim().min(2, "Give the provider a name").max(64),
  apiUrl: z.string().trim().url("Enter the full API URL, e.g. https://provider.com/api/v2").max(255),
  apiKey: z.string().trim().min(8, "Paste the API key from the provider's account page").max(512).optional(),
  driver: z.enum(["v2", "custom"]).default("v2"),
  driverConfig: customDriverConfigSchema.partial().nullable().optional(),
  status: z.enum(["active", "disabled"]).default("active"),
  syncEnabled: z.boolean().default(true),
  syncIntervalMin: z.coerce.number().int().min(15).max(1440).default(180),
  lowBalanceAlert: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .nullable()
    .optional(),
});
export type ProviderInput = z.infer<typeof providerInputSchema>;

const PLATFORM_KEYWORDS: [string, string[]][] = [
  ["instagram", ["instagram", "insta", " ig "]],
  ["tiktok", ["tiktok", "tik tok"]],
  ["youtube", ["youtube", " yt "]],
  ["facebook", ["facebook", " fb "]],
  ["twitter", ["twitter", " x.com", " x "]],
  ["telegram", ["telegram"]],
  ["spotify", ["spotify"]],
  ["twitch", ["twitch"]],
  ["linkedin", ["linkedin"]],
  ["discord", ["discord"]],
  ["threads", ["threads"]],
  ["snapchat", ["snapchat"]],
  ["website", ["website", "traffic", "seo"]],
];

/** Best-guess platform from a provider category name (admins can change it). */
export function guessPlatform(name: string): string {
  const n = ` ${name.toLowerCase()} `;
  for (const [platform, words] of PLATFORM_KEYWORDS) if (words.some((w) => n.includes(w))) return platform;
  return "other";
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .slice(0, 120) || "category"
  );
}

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2, "Name the category").max(120),
  platform: z.string().max(24).default("other"),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(["active", "disabled"]).default("active"),
});

const moneyStr = z.string().regex(/^\d+(\.\d{1,6})?$/, "Enter a price like 1.25");

export const serviceInputSchema = z
  .object({
    categoryId: z.coerce.number().int().positive("Pick a category"),
    name: z.string().trim().min(2, "Name the service").max(255),
    description: z.string().max(5000).nullable().optional(),
    type: z.enum(SERVICE_TYPES).default("default"),
    mode: z.enum(["auto", "manual"]),
    providerId: z.coerce.number().int().positive().nullable().optional(),
    providerServiceId: z.string().trim().max(64).nullable().optional(),
    sellRate: moneyStr.nullable().optional(), // manual services only
    minQty: z.coerce.number().int().min(1).max(1_000_000_000),
    maxQty: z.coerce.number().int().min(1).max(1_000_000_000),
    refill: z.boolean().default(false),
    refillDays: z.coerce.number().int().min(0).max(3650).default(0),
    cancel: z.boolean().default(false),
    dripfeed: z.boolean().default(false),
    badges: z.array(z.string().trim().min(1).max(24)).max(5).default([]),
    status: z.enum(["active", "disabled"]).default("active"),
  })
  .refine((v) => v.maxQty >= v.minQty, { path: ["maxQty"], message: "Max must be at least the min" })
  .refine((v) => v.mode === "manual" || (v.providerId && v.providerServiceId), {
    path: ["providerServiceId"],
    message: "Pick a provider and its service ID",
  })
  .refine((v) => v.mode === "auto" || v.sellRate, { path: ["sellRate"], message: "Set the price per 1,000" });

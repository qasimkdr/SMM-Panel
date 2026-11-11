import { z } from "zod";
import type { ServiceType } from "./constants";
import { chargeFor } from "./pricing";
import { fromMicros, toMicros } from "./money";

/**
 * What a customer fills in for each service type (mirrors the standard API v2 parameters).
 * The web form renders from this and the API validates with it, so they can't drift apart.
 */
export type OrderFieldName =
  | "link"
  | "quantity"
  | "comments"
  | "usernames"
  | "hashtags"
  | "hashtag"
  | "username"
  | "media"
  | "answer_number"
  | "groups"
  | "min"
  | "max"
  | "posts"
  | "old_posts"
  | "delay"
  | "expiry"
  | "keywords";

export interface OrderField {
  name: OrderFieldName;
  label: string;
  kind: "text" | "textarea" | "number";
  placeholder?: string;
  hint?: string;
  optional?: boolean;
}

const link: OrderField = { name: "link", label: "Link", kind: "text", placeholder: "https://…", hint: "Public link to the post or profile. Never your password." };
const quantity: OrderField = { name: "quantity", label: "Quantity", kind: "number" };
const comments: OrderField = { name: "comments", label: "Comments", kind: "textarea", placeholder: "One comment per line", hint: "Each line is one comment. Quantity = number of lines." };
const usernames: OrderField = { name: "usernames", label: "Usernames", kind: "textarea", placeholder: "One username per line" };

export const ORDER_FIELDS: Record<ServiceType, OrderField[]> = {
  default: [link, quantity],
  package: [link],
  custom_comments: [link, comments],
  custom_comments_package: [link, comments],
  mentions: [link, quantity, usernames],
  mentions_with_hashtags: [link, quantity, usernames, { name: "hashtags", label: "Hashtags", kind: "textarea", placeholder: "One hashtag per line" }],
  mentions_custom_list: [link, usernames],
  mentions_hashtag: [link, quantity, { name: "hashtag", label: "Hashtag", kind: "text", placeholder: "#example" }],
  mentions_user_followers: [link, quantity, { name: "username", label: "Username", kind: "text", hint: "Account whose followers will be mentioned" }],
  mentions_media_likers: [link, quantity, { name: "media", label: "Media link", kind: "text", placeholder: "https://…" }],
  comment_likes: [link, quantity, { name: "username", label: "Comment author's username", kind: "text" }],
  comment_replies: [link, { name: "username", label: "Comment author's username", kind: "text" }, comments],
  poll: [link, quantity, { name: "answer_number", label: "Answer number", kind: "number", hint: "Which option to vote for (1, 2, 3…)" }],
  subscriptions: [
    { name: "username", label: "Username", kind: "text", hint: "New posts from this account get the service automatically" },
    { name: "min", label: "Min per post", kind: "number" },
    { name: "max", label: "Max per post", kind: "number" },
    { name: "posts", label: "Number of new posts", kind: "number" },
    { name: "old_posts", label: "Also apply to recent posts", kind: "number", optional: true, hint: "How many existing posts to include" },
    { name: "delay", label: "Delay (minutes)", kind: "number", optional: true },
    { name: "expiry", label: "Expires on", kind: "text", placeholder: "dd/mm/yyyy", optional: true },
  ],
  invites_from_groups: [link, quantity, { name: "groups", label: "Groups", kind: "textarea", placeholder: "One group link per line" }],
  seo: [link, quantity, { name: "keywords", label: "Keywords", kind: "textarea", placeholder: "One keyword per line", optional: true }],
};

export const PACKAGE_TYPES: ServiceType[] = ["package", "custom_comments_package"];
export const LINES_AS_QUANTITY: ServiceType[] = ["custom_comments", "mentions_custom_list", "comment_replies"];

export const lines = (v: unknown) =>
  String(v ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

export interface OrderServiceRule {
  type: ServiceType;
  minQty: number;
  maxQty: number;
  dripfeed: boolean;
}

/** Raw order input as sent by the web form or the v2 API. */
export const orderInputSchema = z.object({
  service: z.coerce.number().int().positive("Pick a service"),
  link: z.string().trim().max(1024).optional(),
  quantity: z.coerce.number().int().optional(),
  runs: z.coerce.number().int().min(2).max(1000).optional(),
  interval: z.coerce.number().int().min(1).max(10080).optional(),
  comments: z.string().max(100_000).optional(),
  usernames: z.string().max(100_000).optional(),
  hashtags: z.string().max(20_000).optional(),
  hashtag: z.string().max(200).optional(),
  username: z.string().max(200).optional(),
  media: z.string().max(1024).optional(),
  answer_number: z.coerce.number().int().min(1).max(100).optional(),
  groups: z.string().max(50_000).optional(),
  min: z.coerce.number().int().min(1).optional(),
  max: z.coerce.number().int().min(1).optional(),
  posts: z.coerce.number().int().min(1).max(10_000).optional(),
  old_posts: z.coerce.number().int().min(0).max(1000).optional(),
  delay: z.coerce.number().int().min(0).max(10_080).optional(),
  expiry: z.string().max(20).optional(),
  keywords: z.string().max(20_000).optional(),
});
export type OrderInput = z.infer<typeof orderInputSchema>;

export interface NormalizedOrder {
  link: string;
  quantity: number; // units per run
  totalQuantity: number; // quantity × runs (what's charged)
  runs: number | null;
  interval: number | null;
  extra: Record<string, string | number>;
}

/**
 * Checks an order against its service and returns what to store, or field errors.
 * Pure function: used by the API (authoritative) and the web form (instant feedback).
 */
export function normalizeOrder(
  input: OrderInput,
  rule: OrderServiceRule,
): { ok: true; order: NormalizedOrder } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const fields = ORDER_FIELDS[rule.type] ?? ORDER_FIELDS.default;
  const extra: Record<string, string | number> = {};

  for (const f of fields) {
    if (f.name === "quantity" || f.name === "link") continue;
    const v = input[f.name as keyof OrderInput];
    if (v === undefined || v === "" || (typeof v === "string" && !v.trim())) {
      if (!f.optional) errors[f.name] = `Enter ${f.label.toLowerCase()}`;
      continue;
    }
    extra[f.name] = typeof v === "string" ? v.trim() : (v as number);
  }

  const needsLink = fields.some((f) => f.name === "link");
  const linkValue = (input.link ?? "").trim();
  if (needsLink) {
    if (linkValue.length < 3) errors.link = "Paste the link to the post or profile";
    else if (/\s/.test(linkValue)) errors.link = "Links can't contain spaces";
  }
  const usernameAsLink = !needsLink ? String(extra.username ?? "") : "";

  let quantity: number;
  if (PACKAGE_TYPES.includes(rule.type)) quantity = 1;
  else if (LINES_AS_QUANTITY.includes(rule.type)) {
    const key = rule.type === "mentions_custom_list" ? "usernames" : "comments";
    quantity = lines(input[key]).length;
    if (!errors[key] && (quantity < rule.minQty || quantity > rule.maxQty))
      errors[key] = `Add between ${rule.minQty} and ${rule.maxQty} lines (you have ${quantity})`;
  } else if (rule.type === "subscriptions") {
    const min = Number(extra.min ?? 0);
    const max = Number(extra.max ?? 0);
    if (min && max && max < min) errors.max = "Max must be at least the min";
    if (min && (min < rule.minQty || max > rule.maxQty)) errors.min = `Per-post amount must be between ${rule.minQty} and ${rule.maxQty}`;
    quantity = max * Number(extra.posts ?? 0);
  } else {
    quantity = Number(input.quantity ?? 0);
    if (!Number.isInteger(quantity) || quantity <= 0) errors.quantity = "Enter a quantity";
    else if (quantity < rule.minQty || quantity > rule.maxQty)
      errors.quantity = `Quantity must be between ${rule.minQty.toLocaleString("en-US")} and ${rule.maxQty.toLocaleString("en-US")}`;
  }

  let runs: number | null = null;
  let interval: number | null = null;
  if (input.runs !== undefined || input.interval !== undefined) {
    if (!rule.dripfeed) errors.runs = "This service doesn't support drip-feed";
    else if (!input.runs || !input.interval) errors.runs = "Set both runs and interval";
    else {
      runs = input.runs;
      interval = input.interval;
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    order: {
      link: needsLink ? linkValue : usernameAsLink,
      quantity,
      totalQuantity: quantity * (runs ?? 1),
      runs,
      interval,
      extra,
    },
  };
}

/** Charge for an order (rate already includes commission and user discount). */
export function orderCharge(type: ServiceType, rate: string, totalQuantity: number): string {
  if (PACKAGE_TYPES.includes(type)) return fromMicros(toMicros(rate));
  return chargeFor(rate, totalQuantity);
}

/** Parses mass-order text: "service_id | link | quantity" per line. */
export function parseMassOrder(text: string) {
  return lines(text).map((line, i) => {
    const [service, link, quantity] = line.split("|").map((p) => p.trim());
    return { line: i + 1, raw: line, service: Number(service), link: link ?? "", quantity: Number(quantity) };
  });
}

/** Redis pub/sub channel for live order updates to one user. */
export const orderChannel = (userId: number) => `orders:user:${userId}`;
export interface OrderEvent {
  id: number;
  status: string;
  remains: number | null;
  startCount: number | null;
  refunded?: string;
}

/** Our status → the Title Case strings API v2 clients expect. */
export const V2_STATUS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  in_progress: "In progress",
  completed: "Completed",
  partial: "Partial",
  canceled: "Canceled",
  fail: "Canceled",
};

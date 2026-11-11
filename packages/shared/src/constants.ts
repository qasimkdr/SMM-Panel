export const ORDER_STATUSES = [
  "pending",
  "processing",
  "in_progress",
  "completed",
  "partial",
  "canceled",
  "fail",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const FINAL_ORDER_STATUSES: OrderStatus[] = ["completed", "partial", "canceled"];

/** Matches the de-facto API v2 service types. */
export const SERVICE_TYPES = [
  "default",
  "package",
  "custom_comments",
  "custom_comments_package",
  "mentions",
  "mentions_with_hashtags",
  "mentions_custom_list",
  "mentions_hashtag",
  "mentions_user_followers",
  "mentions_media_likers",
  "comment_likes",
  "comment_replies",
  "poll",
  "subscriptions",
  "invites_from_groups",
  "seo",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const ROLES = ["user", "staff", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const PLATFORMS = [
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "twitter",
  "telegram",
  "spotify",
  "twitch",
  "linkedin",
  "discord",
  "threads",
  "snapchat",
  "website",
  "other",
] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Default global commission for imported services (owner decision: 20 %). */
export const DEFAULT_GLOBAL_MARKUP = "20";

/** Maps provider API v2 status strings to ours. */
export function normalizeProviderStatus(raw: string): OrderStatus {
  const s = raw.toLowerCase().replace(/\s+/g, "_");
  if (s === "in_progress" || s === "inprogress") return "in_progress";
  if (s === "processing") return "processing";
  if (s === "completed" || s === "complete") return "completed";
  if (s === "partial") return "partial";
  if (s === "canceled" || s === "cancelled" || s === "refunded") return "canceled";
  return "pending";
}

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/* Money columns: DECIMAL(18,6) in USD. Percent columns: DECIMAL(7,2). */
const money = (name: string) => decimal(name, { precision: 18, scale: 6 });
const percent = (name: string) => decimal(name, { precision: 7, scale: 2 });
const id = () => bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey();
const fk = (name: string) => bigint(name, { mode: "number", unsigned: true });
const createdAt = () => timestamp("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);
const updatedAt = () =>
  timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow();

/* ───────────────────────────── Users & auth ───────────────────────────── */

export const vipTiers = mysqlTable("vip_tiers", {
  id: id(),
  name: varchar("name", { length: 48 }).notNull(),
  minSpent: money("min_spent").notNull().default("0"),
  discount: percent("discount").notNull().default("0"),
  color: varchar("color", { length: 16 }).notNull().default("#8a857c"),
  sort: smallint("sort").notNull().default(0),
  createdAt: createdAt(),
});

export const users = mysqlTable(
  "users",
  {
    id: id(),
    username: varchar("username", { length: 32 }).notNull(),
    email: varchar("email", { length: 191 }).notNull(),
    name: varchar("name", { length: 80 }),
    passwordHash: varchar("password_hash", { length: 255 }),
    googleId: varchar("google_id", { length: 64 }),
    role: mysqlEnum("role", ["user", "staff", "admin"]).notNull().default("user"),
    permissions: json("permissions").$type<string[]>(),
    status: mysqlEnum("status", ["active", "banned"]).notNull().default("active"),
    banReason: varchar("ban_reason", { length: 255 }),
    balance: money("balance").notNull().default("0"),
    spent: money("spent").notNull().default("0"),
    affiliateBalance: money("affiliate_balance").notNull().default("0"),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    vipTierId: fk("vip_tier_id"),
    vipLocked: boolean("vip_locked").notNull().default(false),
    customDiscount: percent("custom_discount"),
    apiKey: char("api_key", { length: 48 }),
    apiEnabled: boolean("api_enabled").notNull().default(true),
    referralCode: varchar("referral_code", { length: 16 }).notNull(),
    referredBy: fk("referred_by"),
    twoFactorSecret: varchar("two_factor_secret", { length: 128 }),
    emailVerifiedAt: timestamp("email_verified_at"),
    lastLoginAt: timestamp("last_login_at"),
    lastLoginIp: varchar("last_login_ip", { length: 45 }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email),
    uniqueIndex("users_username_uq").on(t.username),
    uniqueIndex("users_api_key_uq").on(t.apiKey),
    uniqueIndex("users_referral_uq").on(t.referralCode),
    uniqueIndex("users_google_uq").on(t.googleId),
    index("users_referred_by_idx").on(t.referredBy),
    index("users_created_idx").on(t.createdAt),
  ],
);

/** Refresh-token sessions. `id` is SHA-256 of the opaque refresh token. */
export const sessions = mysqlTable(
  "sessions",
  {
    id: char("id", { length: 64 }).primaryKey(),
    userId: fk("user_id").notNull(),
    scope: mysqlEnum("scope", ["user", "admin"]).notNull().default("user"),
    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 255 }),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (t) => [index("sessions_user_idx").on(t.userId, t.revokedAt)],
);

export const emailTokens = mysqlTable(
  "email_tokens",
  {
    id: id(),
    userId: fk("user_id").notNull(),
    type: mysqlEnum("type", ["verify", "reset"]).notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("email_tokens_hash_uq").on(t.tokenHash), index("email_tokens_user_idx").on(t.userId, t.type)],
);

/** Append-only ledger: every balance movement is recorded here. */
export const transactions = mysqlTable(
  "transactions",
  {
    id: id(),
    userId: fk("user_id").notNull(),
    type: mysqlEnum("type", [
      "deposit",
      "order",
      "refund",
      "admin_add",
      "admin_deduct",
      "affiliate_commission",
      "affiliate_withdraw",
      "coupon",
      "bonus",
      "child_panel",
    ]).notNull(),
    amount: money("amount").notNull(), // signed: + credit, - debit
    balanceAfter: money("balance_after").notNull(),
    refType: varchar("ref_type", { length: 24 }),
    refId: fk("ref_id"),
    note: varchar("note", { length: 255 }),
    actorId: fk("actor_id"),
    createdAt: createdAt(),
  },
  (t) => [index("tx_user_idx").on(t.userId, t.id), index("tx_type_created_idx").on(t.type, t.createdAt)],
);

/* ───────────────────────────── Catalog ───────────────────────────── */

export const providers = mysqlTable("providers", {
  id: id(),
  name: varchar("name", { length: 64 }).notNull(),
  apiUrl: varchar("api_url", { length: 255 }).notNull(),
  apiKeyEnc: text("api_key_enc").notNull(), // AES-256-GCM
  driver: mysqlEnum("driver", ["v2", "custom"]).notNull().default("v2"),
  driverConfig: json("driver_config").$type<Record<string, unknown>>(),
  markup: percent("markup"),
  status: mysqlEnum("status", ["active", "disabled"]).notNull().default("active"),
  balance: money("balance"),
  currency: char("currency", { length: 3 }).notNull().default("USD"),
  lowBalanceAlert: money("low_balance_alert"),
  syncEnabled: boolean("sync_enabled").notNull().default(true),
  syncIntervalMin: smallint("sync_interval_min").notNull().default(180),
  lastSyncAt: timestamp("last_sync_at"),
  errorCount: int("error_count").notNull().default(0),
  lastError: varchar("last_error", { length: 255 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const categories = mysqlTable(
  "categories",
  {
    id: id(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    platform: varchar("platform", { length: 24 }).notNull().default("other"),
    description: text("description"),
    markup: percent("markup"),
    sort: int("sort").notNull().default(0),
    status: mysqlEnum("status", ["active", "disabled"]).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("categories_slug_uq").on(t.slug), index("categories_sort_idx").on(t.status, t.sort)],
);

export const services = mysqlTable(
  "services",
  {
    id: id(),
    categoryId: fk("category_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    type: varchar("type", { length: 32 }).notNull().default("default"),
    mode: mysqlEnum("mode", ["auto", "manual"]).notNull().default("auto"),
    providerId: fk("provider_id"),
    providerServiceId: varchar("provider_service_id", { length: 64 }),
    providerRate: money("provider_rate"), // cost per 1000, synced
    markup: percent("markup"), // service-level override (null = inherit)
    sellRate: money("sell_rate").notNull(), // final price per 1000 before user discounts (computed)
    minQty: int("min_qty").notNull().default(10),
    maxQty: int("max_qty").notNull().default(100000),
    refill: boolean("refill").notNull().default(false),
    refillDays: smallint("refill_days").notNull().default(0),
    cancel: boolean("cancel").notNull().default(false),
    dripfeed: boolean("dripfeed").notNull().default(false),
    avgTimeSec: int("avg_time_sec"),
    badges: json("badges").$type<string[]>(),
    keepCustomName: boolean("keep_custom_name").notNull().default(false),
    backupProviderId: fk("backup_provider_id"),
    backupProviderServiceId: varchar("backup_provider_service_id", { length: 64 }),
    sort: int("sort").notNull().default(0),
    status: mysqlEnum("status", ["active", "disabled"]).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("services_cat_idx").on(t.categoryId, t.status, t.sort),
    index("services_provider_idx").on(t.providerId, t.providerServiceId),
  ],
);

export const priceChanges = mysqlTable(
  "price_changes",
  {
    id: id(),
    serviceId: fk("service_id"),
    scope: mysqlEnum("scope", ["service", "category", "provider", "global"]).notNull(),
    scopeId: fk("scope_id"),
    oldValue: varchar("old_value", { length: 32 }),
    newValue: varchar("new_value", { length: 32 }),
    field: mysqlEnum("field", ["markup", "provider_rate", "sell_rate"]).notNull(),
    source: mysqlEnum("source", ["admin", "sync"]).notNull(),
    actorId: fk("actor_id"),
    createdAt: createdAt(),
  },
  (t) => [index("price_changes_service_idx").on(t.serviceId, t.id)],
);

export const favorites = mysqlTable(
  "favorites",
  { userId: fk("user_id").notNull(), serviceId: fk("service_id").notNull(), createdAt: createdAt() },
  (t) => [primaryKey({ columns: [t.userId, t.serviceId] })],
);

/* ───────────────────────────── Orders ───────────────────────────── */

export const orders = mysqlTable(
  "orders",
  {
    id: id(),
    userId: fk("user_id").notNull(),
    serviceId: fk("service_id").notNull(),
    providerId: fk("provider_id"),
    providerOrderId: varchar("provider_order_id", { length: 64 }),
    link: varchar("link", { length: 1024 }).notNull(),
    quantity: int("quantity").notNull(),
    charge: money("charge").notNull(),
    providerCost: money("provider_cost"),
    profit: money("profit"),
    refunded: money("refunded").notNull().default("0"),
    startCount: int("start_count"),
    remains: int("remains"),
    status: mysqlEnum("status", ["pending", "processing", "in_progress", "completed", "partial", "canceled", "fail"])
      .notNull()
      .default("pending"),
    mode: mysqlEnum("mode", ["auto", "manual"]).notNull().default("auto"),
    runs: smallint("runs"),
    intervalMin: smallint("interval_min"),
    extra: json("extra").$type<Record<string, unknown>>(),
    error: varchar("error", { length: 500 }),
    viaApi: boolean("via_api").notNull().default(false),
    idempotencyKey: varchar("idempotency_key", { length: 64 }),
    scheduledAt: timestamp("scheduled_at"),
    completedAt: timestamp("completed_at"),
    lastCheckedAt: timestamp("last_checked_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("orders_user_idx").on(t.userId, t.id),
    index("orders_user_status_idx").on(t.userId, t.status, t.id),
    index("orders_status_provider_idx").on(t.status, t.providerId, t.lastCheckedAt),
    index("orders_provider_order_idx").on(t.providerId, t.providerOrderId),
    index("orders_service_created_idx").on(t.serviceId, t.createdAt),
    index("orders_created_idx").on(t.createdAt),
    uniqueIndex("orders_idem_uq").on(t.userId, t.idempotencyKey),
  ],
);

export const refills = mysqlTable(
  "refills",
  {
    id: id(),
    orderId: fk("order_id").notNull(),
    userId: fk("user_id").notNull(),
    providerRefillId: varchar("provider_refill_id", { length: 64 }),
    status: mysqlEnum("status", ["pending", "in_progress", "completed", "rejected", "fail"]).notNull().default("pending"),
    error: varchar("error", { length: 255 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("refills_order_idx").on(t.orderId), index("refills_user_idx").on(t.userId, t.id), index("refills_status_idx").on(t.status)],
);

/* ───────────────────────────── Money extras ───────────────────────────── */

export const currencies = mysqlTable("currencies", {
  code: char("code", { length: 3 }).primaryKey(),
  name: varchar("name", { length: 48 }).notNull(),
  symbol: varchar("symbol", { length: 8 }).notNull(),
  rate: decimal("rate", { precision: 20, scale: 8 }).notNull().default("1"), // units per 1 USD
  autoRate: boolean("auto_rate").notNull().default(true),
  decimals: tinyint("decimals").notNull().default(2),
  enabled: boolean("enabled").notNull().default(true),
  sort: smallint("sort").notNull().default(0),
  updatedAt: updatedAt(),
});

export const coupons = mysqlTable(
  "coupons",
  {
    id: id(),
    code: varchar("code", { length: 32 }).notNull(),
    kind: mysqlEnum("kind", ["balance", "deposit_bonus"]).notNull().default("balance"),
    valueType: mysqlEnum("value_type", ["fixed", "percent"]).notNull().default("fixed"),
    value: money("value").notNull(),
    maxUses: int("max_uses"),
    used: int("used").notNull().default(0),
    perUserLimit: smallint("per_user_limit").notNull().default(1),
    expiresAt: timestamp("expires_at"),
    status: mysqlEnum("status", ["active", "disabled"]).notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("coupons_code_uq").on(t.code)],
);

export const couponRedemptions = mysqlTable(
  "coupon_redemptions",
  { id: id(), couponId: fk("coupon_id").notNull(), userId: fk("user_id").notNull(), amount: money("amount").notNull(), createdAt: createdAt() },
  (t) => [index("coupon_red_idx").on(t.couponId, t.userId)],
);

export const affiliatePayouts = mysqlTable(
  "affiliate_payouts",
  {
    id: id(),
    userId: fk("user_id").notNull(),
    amount: money("amount").notNull(),
    method: mysqlEnum("method", ["balance", "external"]).notNull().default("balance"),
    details: varchar("details", { length: 255 }),
    status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull().default("pending"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("aff_payouts_user_idx").on(t.userId, t.id), index("aff_payouts_status_idx").on(t.status)],
);

export const affiliateVisits = mysqlTable(
  "affiliate_visits",
  { id: id(), userId: fk("user_id").notNull(), ipHash: char("ip_hash", { length: 64 }).notNull(), createdAt: createdAt() },
  (t) => [index("aff_visits_user_idx").on(t.userId, t.createdAt)],
);

/** Payments are deferred (add funds = coming soon) but the table exists for later gateways. */
export const payments = mysqlTable(
  "payments",
  {
    id: id(),
    userId: fk("user_id").notNull(),
    gateway: varchar("gateway", { length: 32 }).notNull(),
    amount: money("amount").notNull(),
    fee: money("fee").notNull().default("0"),
    bonus: money("bonus").notNull().default("0"),
    externalId: varchar("external_id", { length: 128 }),
    status: mysqlEnum("status", ["pending", "completed", "failed", "refunded"]).notNull().default("pending"),
    meta: json("meta"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("payments_user_idx").on(t.userId, t.id), uniqueIndex("payments_ext_uq").on(t.gateway, t.externalId)],
);

/* ───────────────────────────── Support & content ───────────────────────────── */

export const tickets = mysqlTable(
  "tickets",
  {
    id: id(),
    userId: fk("user_id").notNull(),
    subject: varchar("subject", { length: 160 }).notNull(),
    topic: mysqlEnum("topic", ["order", "payment", "refill", "cancel", "api", "other"]).notNull().default("other"),
    orderIds: varchar("order_ids", { length: 255 }),
    status: mysqlEnum("status", ["open", "answered", "customer_reply", "closed"]).notNull().default("open"),
    assignedTo: fk("assigned_to"),
    lastReplyAt: timestamp("last_reply_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tickets_user_idx").on(t.userId, t.id), index("tickets_status_idx").on(t.status, t.lastReplyAt)],
);

export const ticketMessages = mysqlTable(
  "ticket_messages",
  {
    id: id(),
    ticketId: fk("ticket_id").notNull(),
    userId: fk("user_id").notNull(),
    isStaff: boolean("is_staff").notNull().default(false),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ticket_msgs_ticket_idx").on(t.ticketId, t.id)],
);

export const cannedReplies = mysqlTable("canned_replies", {
  id: id(),
  title: varchar("title", { length: 80 }).notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const announcements = mysqlTable("announcements", {
  id: id(),
  title: varchar("title", { length: 160 }).notNull(),
  body: text("body").notNull(),
  kind: mysqlEnum("kind", ["banner", "popup", "news"]).notNull().default("news"),
  active: boolean("active").notNull().default(true),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  createdAt: createdAt(),
});

export const notifications = mysqlTable(
  "notifications",
  {
    id: id(),
    userId: fk("user_id").notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    body: varchar("body", { length: 500 }),
    href: varchar("href", { length: 255 }),
    readAt: timestamp("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.id)],
);

export const pages = mysqlTable("pages", {
  slug: varchar("slug", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  content: text("content").notNull(),
  metaTitle: varchar("meta_title", { length: 160 }),
  metaDescription: varchar("meta_description", { length: 320 }),
  published: boolean("published").notNull().default(true),
  updatedAt: updatedAt(),
});

/** Key/value settings controlled from the admin dashboard. */
export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: json("value").notNull(),
  updatedAt: updatedAt(),
});

export const adminLogs = mysqlTable(
  "admin_logs",
  {
    id: id(),
    actorId: fk("actor_id").notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    targetType: varchar("target_type", { length: 32 }),
    targetId: varchar("target_id", { length: 64 }),
    meta: json("meta"),
    ip: varchar("ip", { length: 45 }),
    createdAt: createdAt(),
  },
  (t) => [index("admin_logs_actor_idx").on(t.actorId, t.id), index("admin_logs_target_idx").on(t.targetType, t.targetId)],
);

export const childPanels = mysqlTable(
  "child_panels",
  {
    id: id(),
    userId: fk("user_id").notNull(),
    domain: varchar("domain", { length: 191 }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    adminUsername: varchar("admin_username", { length: 32 }).notNull(),
    price: money("price").notNull(),
    status: mysqlEnum("status", ["pending", "active", "suspended", "canceled"]).notNull().default("pending"),
    expiresAt: timestamp("expires_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("child_panels_domain_uq").on(t.domain), index("child_panels_user_idx").on(t.userId)],
);

export const loginEvents = mysqlTable(
  "login_events",
  {
    id: id(),
    userId: fk("user_id").notNull(),
    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 255 }),
    success: boolean("success").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("login_events_user_idx").on(t.userId, t.id), index("login_events_ip_idx").on(t.ip)],
);

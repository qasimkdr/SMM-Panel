import { Router } from "express";
import { z } from "zod";
import { and, count, desc, eq, like, lt, or, schema, sql, type SQL } from "@smm/db";
import { fromMicros, markupSchema, PERMISSIONS, toMicros } from "@smm/shared";
import { db } from "../../lib/db";
import { redis } from "../../lib/redis";
import { invalidate } from "../../lib/cache";
import { randomToken } from "../../lib/crypto";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors";
import { env } from "../../env";
import { parse } from "../../middleware/validate";
import { requireRoleAdmin } from "../../middleware/auth";
import { adjustBalance } from "../../services/ledger";
import { audit } from "../../services/audit";
import { revokeAll } from "../../services/session";
import { invalidateUserPricing } from "../../services/users";

export const adminUsersRouter = Router();
const idParam = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
};

adminUsersRouter.get("/", async (req, res) => {
  const q = parse(
    z.object({
      q: z.string().trim().max(191).optional(),
      cursor: z.coerce.number().int().positive().optional(),
      status: z.enum(["active", "banned"]).optional(),
      role: z.enum(["user", "staff", "admin"]).optional(),
    }),
    req.query,
  );
  const conds: SQL[] = [];
  if (q.cursor) conds.push(lt(schema.users.id, q.cursor));
  if (q.status) conds.push(eq(schema.users.status, q.status));
  if (q.role) conds.push(eq(schema.users.role, q.role));
  if (q.q) {
    const n = Number(q.q);
    const term = `${q.q.replace(/[%_]/g, "\\$&")}%`; // prefix search uses the unique indexes
    conds.push(or(like(schema.users.email, term), like(schema.users.username, term), ...(Number.isInteger(n) ? [eq(schema.users.id, n)] : []))!);
  }
  const rows = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      email: schema.users.email,
      role: schema.users.role,
      status: schema.users.status,
      balance: schema.users.balance,
      spent: schema.users.spent,
      tierName: schema.vipTiers.name,
      tierColor: schema.vipTiers.color,
      emailVerified: schema.users.emailVerifiedAt,
      lastLoginAt: schema.users.lastLoginAt,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .leftJoin(schema.vipTiers, eq(schema.vipTiers.id, schema.users.vipTierId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.users.id))
    .limit(51);
  res.json({ items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49]!.id : null });
});

adminUsersRouter.get("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!u) throw notFound("User not found");
  const [[orders], transactions, logins, [referrals]] = await Promise.all([
    db
      .select({ n: count(), active: sql<number>`SUM(${schema.orders.status} IN ('pending','processing','in_progress'))` })
      .from(schema.orders)
      .where(eq(schema.orders.userId, id)),
    db.select().from(schema.transactions).where(eq(schema.transactions.userId, id)).orderBy(desc(schema.transactions.id)).limit(25),
    db.select().from(schema.loginEvents).where(eq(schema.loginEvents.userId, id)).orderBy(desc(schema.loginEvents.id)).limit(10),
    db.select({ n: count() }).from(schema.users).where(eq(schema.users.referredBy, id)),
  ]);
  const { passwordHash: _p, twoFactorSecret: _t, apiKey, ...safe } = u;
  res.json({
    ...safe,
    hasApiKey: Boolean(apiKey),
    stats: { orders: orders!.n, activeOrders: Number(orders!.active ?? 0), referrals: referrals!.n },
    transactions,
    logins,
  });
});

const patchSchema = z.object({
  name: z.string().trim().max(80).nullable().optional(),
  status: z.enum(["active", "banned"]).optional(),
  banReason: z.string().trim().max(255).nullable().optional(),
  customDiscount: markupSchema.optional(),
  vipTierId: z.number().int().positive().nullable().optional(),
  vipLocked: z.boolean().optional(),
  apiEnabled: z.boolean().optional(),
  notes: z.string().max(5000).nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  emailVerified: z.boolean().optional(),
});

adminUsersRouter.patch("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const input = parse(patchSchema, req.body);
  const [u] = await db.select({ id: schema.users.id, role: schema.users.role, apiKey: schema.users.apiKey }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!u) throw notFound("User not found");
  if (id === req.auth!.userId && input.status === "banned") throw badRequest("You can't ban yourself");
  if (u.role === "admin" && input.status === "banned" && req.auth!.role !== "admin") throw forbidden("Only admins can ban an admin");
  if (input.customDiscount && Number(input.customDiscount) > 90) throw badRequest("Please check the highlighted fields", { customDiscount: "Use 90% or less" });

  const { emailVerified, ...rest } = input;
  await db
    .update(schema.users)
    .set({
      ...rest,
      ...(input.status === "active" ? { banReason: null } : {}),
      ...(emailVerified !== undefined ? { emailVerifiedAt: emailVerified ? new Date() : null } : {}),
    })
    .where(eq(schema.users.id, id));

  if (input.status === "banned") {
    await revokeAll(id); // signs them out everywhere
    if (u.apiKey) await redis.del(`apikey:${u.apiKey}`);
  }
  if (input.apiEnabled !== undefined && u.apiKey) await redis.del(`apikey:${u.apiKey}`);
  await invalidate(`user:${id}:access`);
  await invalidateUserPricing(id);
  await audit(req, "user.update", "user", id, input);
  res.json({ ok: true });
});

/** Role and staff permissions — admins only. */
adminUsersRouter.put("/:id/role", requireRoleAdmin(), async (req, res) => {
  const id = idParam(req.params.id);
  const input = parse(
    z.object({ role: z.enum(["user", "staff", "admin"]), permissions: z.array(z.enum(PERMISSIONS.map((p) => p.value) as [string, ...string[]])).default([]) }),
    req.body,
  );
  if (id === req.auth!.userId && input.role !== "admin") throw badRequest("You can't remove your own admin role");
  await db.update(schema.users).set({ role: input.role, permissions: input.role === "staff" ? input.permissions : null }).where(eq(schema.users.id, id));
  if (input.role === "user") await revokeAll(id); // drop any admin sessions
  await invalidate(`user:${id}:access`);
  await audit(req, "user.role", "user", id, input);
  res.json({ ok: true });
});

/** Manual top-up / deduction (how funds are added while payments are "coming soon"). */
adminUsersRouter.post("/:id/balance", async (req, res) => {
  const input = parse(
    z.object({
      action: z.enum(["add", "deduct"]),
      amount: z.string().regex(/^\d+(\.\d{1,6})?$/, "Enter an amount like 10 or 10.50"),
      note: z.string().trim().max(255).optional(),
    }),
    req.body,
  );
  const userId = idParam(req.params.id);
  const micros = toMicros(input.amount);
  if (micros <= 0n) throw badRequest("Please check the highlighted fields", { amount: "Enter an amount above 0" });
  const result = await adjustBalance({
    userId,
    amount: fromMicros(input.action === "add" ? micros : -micros),
    type: input.action === "add" ? "admin_add" : "admin_deduct",
    note: input.note,
    actorId: req.auth!.userId,
  });
  await audit(req, `user.balance.${input.action}`, "user", userId, { amount: input.amount, note: input.note });
  res.json({ ok: true, ...result });
});

adminUsersRouter.post("/:id/logout-all", async (req, res) => {
  const id = idParam(req.params.id);
  await revokeAll(id);
  await audit(req, "user.logout_all", "user", id);
  res.json({ ok: true });
});

/**
 * "Sign in as user": a one-time token (60 s) opened on the customer site, which exchanges it for
 * a normal customer session. Cookies stay host-scoped, so the admin session is untouched.
 */
adminUsersRouter.post("/:id/impersonate", requireRoleAdmin(), async (req, res) => {
  const id = idParam(req.params.id);
  const [u] = await db.select({ status: schema.users.status, role: schema.users.role }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!u) throw notFound("User not found");
  if (u.status !== "active") throw conflict("Unban the user first");
  const token = randomToken(32);
  await redis.set(`imp:${token}`, JSON.stringify({ userId: id, adminId: req.auth!.userId }), "EX", 60);
  await audit(req, "user.impersonate", "user", id);
  res.json({ url: `${env.WEB_URL}/impersonate?token=${token}` });
});

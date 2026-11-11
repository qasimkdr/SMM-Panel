import { Router } from "express";
import { z } from "zod";
import { createHash } from "node:crypto";
import { and, applyBalanceChange, BalanceError, count, desc, eq, gte, lt, notify, schema, sql, sum, type SQL } from "@smm/db";
import { childPanelSchema, couponSchema, payoutRequestSchema, redeemSchema, toMicros } from "@smm/shared";
import { db } from "../lib/db";
import { redis } from "../lib/redis";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { getSetting } from "../lib/settings";
import { parse } from "../middleware/validate";
import { requirePerm, requireUser } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { audit } from "../services/audit";

const perUser = (name: string, limit: number, windowSec: number) => rateLimit({ name, limit, windowSec, key: (r) => String(r.auth!.userId) });
const money2 = (v: string) => `$${Number(v).toFixed(2)}`;

/* ═════════════ Affiliates ═════════════ */
export const affiliatesRouter = Router();

/** Public: count a referral-link visit (one per IP per code per day, IP stored hashed). */
affiliatesRouter.post("/visit", rateLimit({ name: "aff-visit", limit: 30, windowSec: 3600 }), async (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().min(4).max(16) }), req.body);
  const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.referralCode, code)).limit(1);
  if (u) {
    const ipHash = createHash("sha256").update(`${req.ip}|${code}`).digest("hex");
    const fresh = await redis.set(`affv:${ipHash}`, "1", "EX", 86_400, "NX");
    if (fresh) await db.insert(schema.affiliateVisits).values({ userId: u.id, ipHash });
  }
  res.json({ ok: true, valid: Boolean(u) });
});

affiliatesRouter.get("/", requireUser, async (req, res) => {
  if (!(await getSetting("features.affiliates", true))) throw forbidden("The affiliate program is turned off");
  const userId = req.auth!.userId;
  const [[me], [visits], [signups], [earned], recent, payouts] = await Promise.all([
    db.select({ code: schema.users.referralCode, balance: schema.users.affiliateBalance }).from(schema.users).where(eq(schema.users.id, userId)),
    db.select({ n: count() }).from(schema.affiliateVisits).where(eq(schema.affiliateVisits.userId, userId)),
    db.select({ n: count() }).from(schema.users).where(eq(schema.users.referredBy, userId)),
    db.select({ total: sum(schema.affiliateEarnings.amount) }).from(schema.affiliateEarnings).where(eq(schema.affiliateEarnings.referrerId, userId)),
    db
      .select({ id: schema.affiliateEarnings.id, amount: schema.affiliateEarnings.amount, orderId: schema.affiliateEarnings.orderId, createdAt: schema.affiliateEarnings.createdAt })
      .from(schema.affiliateEarnings)
      .where(eq(schema.affiliateEarnings.referrerId, userId))
      .orderBy(desc(schema.affiliateEarnings.id))
      .limit(20),
    db.select().from(schema.affiliatePayouts).where(eq(schema.affiliatePayouts.userId, userId)).orderBy(desc(schema.affiliatePayouts.id)).limit(20),
  ]);
  res.set("Cache-Control", "private, no-store");
  res.json({
    code: me!.code,
    balance: me!.balance,
    visits: visits!.n,
    signups: signups!.n,
    earned: earned!.total ?? "0",
    commissionPercent: String(await getSetting("affiliate.commissionPercent", "5")),
    minPayout: String(await getSetting("affiliate.minPayout", "10")),
    recent,
    payouts,
  });
});

/**
 * Payout: "balance" moves earnings into the main balance instantly (ledger); "external" holds the
 * amount and waits for admin approval. The affiliate balance is decremented with a conditional
 * UPDATE, so two parallel requests can't withdraw the same money.
 */
affiliatesRouter.post("/payout", requireUser, perUser("payout", 10, 3600), async (req, res) => {
  const input = parse(payoutRequestSchema, req.body);
  const userId = req.auth!.userId;
  const min = String(await getSetting("affiliate.minPayout", "10"));
  if (toMicros(input.amount) < toMicros(min)) throw badRequest(`The minimum payout is ${money2(min)}`, { amount: `At least ${money2(min)}` });
  if (input.method === "external" && !input.details) throw badRequest("Please check the highlighted fields", { details: "Tell us where to send it" });

  await db.transaction(async (tx) => {
    const [r] = await tx
      .update(schema.users)
      .set({ affiliateBalance: sql`${schema.users.affiliateBalance} - ${input.amount}` })
      .where(and(eq(schema.users.id, userId), gte(schema.users.affiliateBalance, input.amount)));
    if (r.affectedRows !== 1) throw badRequest("You don't have that much in affiliate earnings", { amount: "More than your earnings" });
    const [p] = await tx.insert(schema.affiliatePayouts).values({
      userId,
      amount: input.amount,
      method: input.method,
      details: input.details ?? null,
      status: input.method === "balance" ? "approved" : "pending",
    });
    if (input.method === "balance")
      await applyBalanceChange(tx, { userId, amount: input.amount, type: "affiliate_withdraw", refType: "affiliate_payout", refId: Number(p.insertId), note: "Affiliate earnings moved to balance" });
  });
  res.json({ ok: true, instant: input.method === "balance" });
});

export const adminAffiliatesRouter = Router();
adminAffiliatesRouter.use(requirePerm("users"));

adminAffiliatesRouter.get("/payouts", async (req, res) => {
  const status = z.enum(["pending", "approved", "rejected", "all"]).default("pending").parse(req.query.status ?? "pending");
  const rows = await db
    .select({ p: schema.affiliatePayouts, username: schema.users.username, email: schema.users.email })
    .from(schema.affiliatePayouts)
    .innerJoin(schema.users, eq(schema.users.id, schema.affiliatePayouts.userId))
    .where(status === "all" ? undefined : eq(schema.affiliatePayouts.status, status))
    .orderBy(desc(schema.affiliatePayouts.id))
    .limit(100);
  const top = await db
    .select({ referrerId: schema.affiliateEarnings.referrerId, username: schema.users.username, total: sum(schema.affiliateEarnings.amount), orders: count() })
    .from(schema.affiliateEarnings)
    .innerJoin(schema.users, eq(schema.users.id, schema.affiliateEarnings.referrerId))
    .groupBy(schema.affiliateEarnings.referrerId, schema.users.username)
    .orderBy(desc(sum(schema.affiliateEarnings.amount)))
    .limit(10);
  res.json({ payouts: rows.map((r) => ({ ...r.p, username: r.username, email: r.email })), top });
});

adminAffiliatesRouter.post("/payouts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { action } = parse(z.object({ action: z.enum(["approve", "reject"]) }), req.body);
  const result = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(schema.affiliatePayouts).where(eq(schema.affiliatePayouts.id, id)).for("update");
    if (!p) throw notFound("Payout not found");
    if (p.status !== "pending") throw conflict("This payout was already handled");
    await tx.update(schema.affiliatePayouts).set({ status: action === "approve" ? "approved" : "rejected" }).where(eq(schema.affiliatePayouts.id, id));
    // Rejected: the held amount goes back to their affiliate earnings.
    if (action === "reject") await tx.update(schema.users).set({ affiliateBalance: sql`${schema.users.affiliateBalance} + ${p.amount}` }).where(eq(schema.users.id, p.userId));
    return p;
  });
  await notify(db, {
    userId: result.userId,
    kind: "affiliate",
    title: action === "approve" ? `Payout of ${money2(result.amount)} approved` : `Payout of ${money2(result.amount)} declined`,
    body: action === "approve" ? "It's on its way to the details you gave." : "The amount is back in your affiliate earnings. Contact support for details.",
    href: "/dashboard/affiliates",
  });
  await audit(req, `affiliate.payout.${action}`, "payout", id);
  res.json({ ok: true });
});

/* ═════════════ Coupons ═════════════ */
export const couponsRouter = Router();

/**
 * Redeem: the coupon row is locked (FOR UPDATE) so a code limited to 100 uses is used exactly
 * 100 times even under a rush; per-user limits checked inside the same transaction.
 */
couponsRouter.post("/redeem", requireUser, perUser("redeem", 10, 3600), async (req, res) => {
  const code = parse(redeemSchema, req.body).code.toUpperCase();
  const userId = req.auth!.userId;
  try {
    const out = await db.transaction(async (tx) => {
      const [c] = await tx.select().from(schema.coupons).where(eq(schema.coupons.code, code)).for("update");
      if (!c || c.status !== "active" || c.kind !== "balance") throw badRequest("This code isn't valid", { code: "Code not found" });
      if (c.expiresAt && c.expiresAt.getTime() < Date.now()) throw badRequest("This code has expired", { code: "Expired" });
      if (c.maxUses !== null && c.used >= c.maxUses) throw badRequest("This code has been fully used", { code: "No uses left" });
      const [{ mine }] = (await tx
        .select({ mine: count() })
        .from(schema.couponRedemptions)
        .where(and(eq(schema.couponRedemptions.couponId, c.id), eq(schema.couponRedemptions.userId, userId)))) as [{ mine: number }];
      if (mine >= c.perUserLimit) throw badRequest("You've already used this code", { code: "Already used" });
      await tx.update(schema.coupons).set({ used: sql`${schema.coupons.used} + 1` }).where(eq(schema.coupons.id, c.id));
      const [r] = await tx.insert(schema.couponRedemptions).values({ couponId: c.id, userId, amount: c.value });
      const b = await applyBalanceChange(tx, { userId, amount: c.value, type: "coupon", refType: "coupon", refId: Number(r.insertId), note: `Code ${c.code}` });
      return { amount: c.value, balance: b.balance };
    });
    res.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof BalanceError) throw badRequest(e.message);
    throw e;
  }
});

export const adminCouponsRouter = Router();
adminCouponsRouter.use(requirePerm("pricing"));

adminCouponsRouter.get("/", async (_req, res) => {
  res.json(await db.select().from(schema.coupons).orderBy(desc(schema.coupons.id)).limit(200));
});

adminCouponsRouter.post("/", async (req, res) => {
  const input = parse(couponSchema, req.body);
  try {
    const [r] = await db.insert(schema.coupons).values({ ...input, kind: "balance", valueType: "fixed", expiresAt: input.expiresAt ? new Date(input.expiresAt) : null });
    await audit(req, "coupon.create", "coupon", Number(r.insertId), { code: input.code, value: input.value });
    res.status(201).json({ ok: true, id: Number(r.insertId) });
  } catch (e) {
    if ((e as { cause?: { code?: string } }).cause?.code === "ER_DUP_ENTRY") throw conflict("That code already exists", { code: "Already exists" });
    throw e;
  }
});

adminCouponsRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const input = parse(z.object({ status: z.enum(["active", "disabled"]).optional(), maxUses: z.number().int().min(1).nullable().optional(), expiresAt: z.string().datetime().nullable().optional() }), req.body);
  await db
    .update(schema.coupons)
    .set({
      status: input.status,
      maxUses: input.maxUses,
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } : {}),
    })
    .where(eq(schema.coupons.id, id));
  await audit(req, "coupon.update", "coupon", id, input);
  res.json({ ok: true });
});

/* ═════════════ Child panels ═════════════ */
export const childPanelsRouter = Router();
childPanelsRouter.use(requireUser);

childPanelsRouter.get("/", async (req, res) => {
  const [rows, price] = await Promise.all([
    db.select().from(schema.childPanels).where(eq(schema.childPanels.userId, req.auth!.userId)).orderBy(desc(schema.childPanels.id)),
    getSetting("childPanel.monthlyPrice", "25"),
  ]);
  res.json({ enabled: await getSetting("features.childPanels", true), monthlyPrice: String(price), panels: rows });
});

/** Order: first month charged from balance (ledger) in the same transaction as the record. */
childPanelsRouter.post("/", perUser("child-panel", 5, 3600), async (req, res) => {
  if (!(await getSetting("features.childPanels", true))) throw forbidden("Child panels aren't available right now");
  const input = parse(childPanelSchema, req.body);
  const price = String(await getSetting("childPanel.monthlyPrice", "25"));
  try {
    const id = await db.transaction(async (tx) => {
      const [r] = await tx.insert(schema.childPanels).values({ userId: req.auth!.userId, ...input, price, status: "pending" });
      const panelId = Number(r.insertId);
      await applyBalanceChange(tx, { userId: req.auth!.userId, amount: `-${price}`, type: "child_panel", refType: "child_panel", refId: panelId, note: `Child panel ${input.domain}: first month` });
      return panelId;
    });
    res.status(201).json({ ok: true, id });
  } catch (e) {
    if (e instanceof BalanceError) throw badRequest(`Not enough balance. A child panel costs ${money2(price)} per month.`);
    if ((e as { cause?: { code?: string } }).cause?.code === "ER_DUP_ENTRY") throw conflict("That domain is already registered", { domain: "Already in use" });
    throw e;
  }
});

childPanelsRouter.patch("/:id", async (req, res) => {
  const { autoRenew } = parse(z.object({ autoRenew: z.boolean() }), req.body);
  await db.update(schema.childPanels).set({ autoRenew }).where(and(eq(schema.childPanels.id, Number(req.params.id)), eq(schema.childPanels.userId, req.auth!.userId)));
  res.json({ ok: true });
});

export const adminChildPanelsRouter = Router();
adminChildPanelsRouter.use(requirePerm("users"));

adminChildPanelsRouter.get("/", async (req, res) => {
  const conds: SQL[] = [];
  const cursor = Number(req.query.cursor) || 0;
  if (cursor) conds.push(lt(schema.childPanels.id, cursor));
  const rows = await db
    .select({ p: schema.childPanels, username: schema.users.username })
    .from(schema.childPanels)
    .innerJoin(schema.users, eq(schema.users.id, schema.childPanels.userId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.childPanels.id))
    .limit(100);
  res.json(rows.map((r) => ({ ...r.p, username: r.username })));
});

adminChildPanelsRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const input = parse(z.object({ status: z.enum(["pending", "active", "suspended", "canceled"]).optional(), notes: z.string().max(5000).nullable().optional() }), req.body);
  const [p] = await db.select().from(schema.childPanels).where(eq(schema.childPanels.id, id)).limit(1);
  if (!p) throw notFound("Child panel not found");
  // Activating for the first time starts the 30-day period.
  const patch = { ...input, ...(input.status === "active" && !p.expiresAt ? { expiresAt: new Date(Date.now() + 30 * 86_400_000) } : {}) };
  await db.update(schema.childPanels).set(patch).where(eq(schema.childPanels.id, id));
  if (input.status && input.status !== p.status)
    await notify(db, {
      userId: p.userId,
      kind: "child_panel",
      title: input.status === "active" ? `${p.domain} is live` : `${p.domain} is ${input.status}`,
      body: input.status === "active" ? "Your child panel is ready. Sign in with the admin username you chose." : null,
      href: "/dashboard/child-panel",
    });
  await audit(req, "child_panel.update", "child_panel", id, input);
  res.json({ ok: true });
});


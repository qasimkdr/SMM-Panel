import express, { Router } from "express";
import { z } from "zod";
import {
  and,
  approvePayment,
  asc,
  count,
  desc,
  eq,
  findBinancePayment,
  lt,
  PaymentStateError,
  rejectPayment,
  schema,
  type SQL,
} from "@smm/db";
import { depositInputSchema, localToUsd, paymentMethodInputSchema } from "@smm/shared";
import { db } from "../lib/db";
import { decrypt, encrypt } from "../lib/crypto";
import { badRequest, conflict, notFound } from "../lib/errors";
import { logger } from "../lib/logger";
import { parse } from "../middleware/validate";
import { requireUser } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { getSetting } from "../lib/settings";
import { audit } from "../services/audit";

const perUser = (name: string, limit: number, windowSec: number) => rateLimit({ name, limit, windowSec, key: (r) => String(r.auth!.userId) });
const idParam = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
};
const isDup = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "ER_DUP_ENTRY" || err?.cause?.code === "ER_DUP_ENTRY";
};
const stateError = (e: unknown) => {
  if (e instanceof PaymentStateError) return conflict(e.message);
  return e;
};
const MAX_PENDING = 5;
const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Checks the file really is the image type it claims (magic bytes), not just its header. */
function sniffImage(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

async function rateFor(currency: string): Promise<string> {
  if (currency === "USD") return "1";
  const [c] = await db.select({ rate: schema.currencies.rate }).from(schema.currencies).where(eq(schema.currencies.code, currency)).limit(1);
  if (!c || Number(c.rate) <= 0) throw conflict(`No exchange rate for ${currency} yet. Please try again later.`);
  return c.rate;
}

async function binanceKeys(method: typeof schema.paymentMethods.$inferSelect) {
  if (!method.apiKeyEnc || !method.apiSecretEnc) return null;
  try {
    return { key: decrypt(method.apiKeyEnc), secret: decrypt(method.apiSecretEnc) };
  } catch {
    return null;
  }
}

/**
 * Tries to confirm a Binance Pay deposit automatically. Credits it when the transfer is found and is in a dollar
 * stablecoin; otherwise leaves it pending for an admin and records what was found.
 */
async function tryAutoConfirm(paymentId: number, method: typeof schema.paymentMethods.$inferSelect, txnId: string, actorId: number | null) {
  const keys = await binanceKeys(method);
  if (!keys) return { confirmed: false as const, reason: "Automatic check isn't set up" };
  let match;
  try {
    match = await findBinancePayment(keys.key, keys.secret, txnId);
  } catch (e) {
    logger.warn({ err: e, paymentId }, "binance check failed");
    return { confirmed: false as const, reason: (e as Error).message };
  }
  if (!match) return { confirmed: false as const, reason: "Not found in Binance Pay history yet" };
  const [p] = await db.select({ meta: schema.payments.meta }).from(schema.payments).where(eq(schema.payments.id, paymentId)).limit(1);
  const meta = { ...((p?.meta as object) ?? {}), binance: match };
  if (!match.amountUsd) {
    await db.update(schema.payments).set({ meta }).where(eq(schema.payments.id, paymentId));
    return { confirmed: false as const, reason: `Found, but paid in ${match.currency}. An admin will confirm the amount.` };
  }
  try {
    const r = await approvePayment(db, { paymentId, amountUsd: match.amountUsd, actorId, externalId: match.transactionId, meta, note: "Confirmed automatically with Binance Pay" });
    return { confirmed: true as const, amount: r.amount };
  } catch (e) {
    if (isDup(e)) {
      await db.update(schema.payments).set({ meta: { ...meta, duplicate: true } }).where(eq(schema.payments.id, paymentId));
      return { confirmed: false as const, reason: "This Binance transfer was already used for another deposit" };
    }
    if (e instanceof PaymentStateError) return { confirmed: false as const, reason: e.message };
    throw e;
  }
}

/* ───────────── Customer: deposits ───────────── */
export const paymentsRouter = Router();
paymentsRouter.use(requireUser);

paymentsRouter.get("/methods", async (_req, res) => {
  if (!(await getSetting("features.addFunds", false))) return res.json({ enabled: false, methods: [] });
  const methods = await db
    .select({
      id: schema.paymentMethods.id,
      name: schema.paymentMethods.name,
      kind: schema.paymentMethods.kind,
      brand: schema.paymentMethods.brand,
      currency: schema.paymentMethods.currency,
      accountTitle: schema.paymentMethods.accountTitle,
      accountNumber: schema.paymentMethods.accountNumber,
      instructions: schema.paymentMethods.instructions,
      minAmount: schema.paymentMethods.minAmount,
      maxAmount: schema.paymentMethods.maxAmount,
      rate: schema.currencies.rate,
    })
    .from(schema.paymentMethods)
    .leftJoin(schema.currencies, eq(schema.currencies.code, schema.paymentMethods.currency))
    .where(eq(schema.paymentMethods.status, "active"))
    .orderBy(asc(schema.paymentMethods.sort), asc(schema.paymentMethods.id));
  res.set("Cache-Control", "private, no-store");
  res.json({ enabled: true, methods: methods.map((m) => ({ ...m, rate: m.currency === "USD" ? "1" : m.rate })) });
});

/** Step 1: upload the receipt screenshot (raw image body, compressed in the browser). */
paymentsRouter.post(
  "/proof",
  perUser("pay-proof", 20, 3600),
  express.raw({ type: PROOF_TYPES, limit: "4mb" }),
  async (req, res) => {
    const buf = req.body as unknown;
    if (!Buffer.isBuffer(buf) || buf.length === 0) throw badRequest("Upload a JPG, PNG or WebP image under 4 MB");
    const mime = sniffImage(buf);
    if (!mime) throw badRequest("That file isn't a JPG, PNG or WebP image");
    const [r] = await db.insert(schema.paymentProofs).values({ userId: req.auth!.userId, mime, data: buf });
    res.status(201).json({ proofId: Number(r.insertId) });
  },
);

/** Step 2: submit the deposit for review (Binance Pay is checked automatically). */
paymentsRouter.post("/", perUser("pay-submit", 10, 3600), async (req, res) => {
  const userId = req.auth!.userId;
  if (!(await getSetting("features.addFunds", false))) throw conflict("Adding funds is turned off right now");
  const input = parse(depositInputSchema, req.body);
  const [method] = await db
    .select()
    .from(schema.paymentMethods)
    .where(and(eq(schema.paymentMethods.id, input.methodId), eq(schema.paymentMethods.status, "active")))
    .limit(1);
  if (!method) throw badRequest("Please check the highlighted fields", { methodId: "This payment method isn't available" });
  const amt = Number(input.amount);
  if (amt < Number(method.minAmount)) throw badRequest("Please check the highlighted fields", { amount: `Minimum is ${method.minAmount} ${method.currency}` });
  if (method.maxAmount && amt > Number(method.maxAmount)) throw badRequest("Please check the highlighted fields", { amount: `Maximum is ${method.maxAmount} ${method.currency}` });
  if (method.kind === "manual" && !input.proofId) throw badRequest("Please check the highlighted fields", { proof: "Upload a screenshot of your receipt" });
  if (input.proofId) {
    const [proof] = await db
      .select({ id: schema.paymentProofs.id })
      .from(schema.paymentProofs)
      .where(and(eq(schema.paymentProofs.id, input.proofId), eq(schema.paymentProofs.userId, userId)))
      .limit(1);
    if (!proof) throw badRequest("Please check the highlighted fields", { proof: "Upload the screenshot again" });
  }
  const [{ n }] = (await db
    .select({ n: count() })
    .from(schema.payments)
    .where(and(eq(schema.payments.userId, userId), eq(schema.payments.status, "pending")))) as [{ n: number }];
  if (n >= MAX_PENDING) throw conflict(`You have ${n} deposits waiting for review. Please wait until they're checked.`);

  const amountUsd = localToUsd(input.amount, await rateFor(method.currency));
  let paymentId: number;
  try {
    const [r] = await db.insert(schema.payments).values({
      userId,
      gateway: method.kind === "binance_pay" ? "binance_pay" : "manual",
      methodId: method.id,
      amount: amountUsd,
      amountLocal: input.amount,
      currency: method.currency,
      externalId: input.txnId,
      proofId: input.proofId ?? null,
      userNote: input.note || null,
      meta: { method: method.name },
    });
    paymentId = Number(r.insertId);
  } catch (e) {
    if (isDup(e)) throw conflict("This transaction ID was already submitted", { txnId: "This transaction ID was already submitted" });
    throw e;
  }

  if (method.kind === "binance_pay") {
    const r = await tryAutoConfirm(paymentId, method, input.txnId, null);
    if (r.confirmed) return res.status(201).json({ id: paymentId, status: "completed", amount: r.amount });
  }
  res.status(201).json({ id: paymentId, status: "pending", amount: amountUsd });
});

paymentsRouter.get("/", async (req, res) => {
  const q = parse(z.object({ cursor: z.coerce.number().int().positive().optional() }), req.query);
  const rows = await db
    .select({
      id: schema.payments.id,
      method: schema.paymentMethods.name,
      brand: schema.paymentMethods.brand,
      amount: schema.payments.amount,
      amountLocal: schema.payments.amountLocal,
      currency: schema.payments.currency,
      txnId: schema.payments.externalId,
      status: schema.payments.status,
      adminNote: schema.payments.adminNote,
      createdAt: schema.payments.createdAt,
    })
    .from(schema.payments)
    .leftJoin(schema.paymentMethods, eq(schema.paymentMethods.id, schema.payments.methodId))
    .where(and(eq(schema.payments.userId, req.auth!.userId), ...(q.cursor ? [lt(schema.payments.id, q.cursor)] : [])))
    .orderBy(desc(schema.payments.id))
    .limit(21);
  res.set("Cache-Control", "private, no-store");
  res.json({ items: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19]!.id : null });
});

/* ───────────── Admin: review deposits ───────────── */
export const adminPaymentsRouter = Router();

adminPaymentsRouter.get("/summary", async (_req, res) => {
  const [{ n }] = (await db.select({ n: count() }).from(schema.payments).where(eq(schema.payments.status, "pending"))) as [{ n: number }];
  res.set("Cache-Control", "private, no-store");
  res.json({ pending: n });
});

adminPaymentsRouter.get("/", async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(["pending", "completed", "rejected", "all"]).default("pending"),
      userId: z.coerce.number().int().positive().optional(),
      cursor: z.coerce.number().int().positive().optional(),
    }),
    req.query,
  );
  const conds: SQL[] = [];
  if (q.status !== "all") conds.push(eq(schema.payments.status, q.status));
  if (q.userId) conds.push(eq(schema.payments.userId, q.userId));
  if (q.cursor) conds.push(lt(schema.payments.id, q.cursor));
  const rows = await db
    .select({
      id: schema.payments.id,
      userId: schema.payments.userId,
      username: schema.users.username,
      email: schema.users.email,
      method: schema.paymentMethods.name,
      brand: schema.paymentMethods.brand,
      kind: schema.paymentMethods.kind,
      gateway: schema.payments.gateway,
      amount: schema.payments.amount,
      amountLocal: schema.payments.amountLocal,
      currency: schema.payments.currency,
      txnId: schema.payments.externalId,
      status: schema.payments.status,
      hasProof: schema.payments.proofId,
      userNote: schema.payments.userNote,
      adminNote: schema.payments.adminNote,
      meta: schema.payments.meta,
      reviewedAt: schema.payments.reviewedAt,
      createdAt: schema.payments.createdAt,
    })
    .from(schema.payments)
    .leftJoin(schema.users, eq(schema.users.id, schema.payments.userId))
    .leftJoin(schema.paymentMethods, eq(schema.paymentMethods.id, schema.payments.methodId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.payments.id))
    .limit(51);
  res.set("Cache-Control", "private, no-store");
  res.json({
    items: rows.slice(0, 50).map((r) => ({ ...r, hasProof: Boolean(r.hasProof), txnId: r.txnId ?? (r.meta as { rejectedTxnId?: string } | null)?.rejectedTxnId ?? null })),
    nextCursor: rows.length > 50 ? rows[49]!.id : null,
  });
});

adminPaymentsRouter.get("/:id/proof", async (req, res) => {
  const id = idParam(req.params.id);
  const [row] = await db
    .select({ mime: schema.paymentProofs.mime, data: schema.paymentProofs.data })
    .from(schema.payments)
    .innerJoin(schema.paymentProofs, eq(schema.paymentProofs.id, schema.payments.proofId))
    .where(eq(schema.payments.id, id))
    .limit(1);
  if (!row) throw notFound("No screenshot for this deposit");
  res.set({ "Content-Type": row.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" });
  res.send(row.data);
});

adminPaymentsRouter.post("/:id/approve", async (req, res) => {
  const id = idParam(req.params.id);
  const input = parse(
    z.object({
      amount: z.string().trim().regex(/^\d{1,9}(\.\d{1,6})?$/, "Enter a USD amount like 3.60").optional(),
      note: z.string().trim().max(255).optional(),
    }),
    req.body,
  );
  try {
    const r = await approvePayment(db, { paymentId: id, amountUsd: input.amount, actorId: req.auth!.userId, note: input.note ?? null });
    await audit(req, "payment.approve", "payment", id, { amount: r.amount, userId: r.userId });
    res.json({ ok: true, ...r });
  } catch (e) {
    throw stateError(e);
  }
});

adminPaymentsRouter.post("/:id/reject", async (req, res) => {
  const id = idParam(req.params.id);
  const { note } = parse(z.object({ note: z.string().trim().min(3, "Tell the customer why").max(255) }), req.body);
  try {
    await rejectPayment(db, { paymentId: id, actorId: req.auth!.userId, note });
  } catch (e) {
    throw stateError(e);
  }
  await audit(req, "payment.reject", "payment", id, { note });
  res.json({ ok: true });
});

/** Binance Pay: look the transfer up again (e.g. it wasn't in the history yet when submitted). */
adminPaymentsRouter.post("/:id/check", async (req, res) => {
  const id = idParam(req.params.id);
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, id)).limit(1);
  if (!p) throw notFound("Payment not found");
  if (p.status !== "pending") throw conflict(`This payment is already ${p.status}`);
  const [method] = p.methodId ? await db.select().from(schema.paymentMethods).where(eq(schema.paymentMethods.id, p.methodId)).limit(1) : [];
  if (!method || method.kind !== "binance_pay" || !p.externalId) throw conflict("Only Binance Pay deposits can be checked automatically");
  const r = await tryAutoConfirm(id, method, p.externalId, req.auth!.userId);
  if (r.confirmed) await audit(req, "payment.approve", "payment", id, { amount: r.amount, auto: true });
  res.json(r);
});

/* ───────────── Admin: payment methods ───────────── */
export const adminPaymentMethodsRouter = Router();

function presentMethod(m: typeof schema.paymentMethods.$inferSelect) {
  const { apiKeyEnc, apiSecretEnc, ...rest } = m;
  return { ...rest, hasApiKey: Boolean(apiKeyEnc && apiSecretEnc) };
}

adminPaymentMethodsRouter.get("/", async (_req, res) => {
  const rows = await db.select().from(schema.paymentMethods).orderBy(asc(schema.paymentMethods.sort), asc(schema.paymentMethods.id));
  res.json(rows.map(presentMethod));
});

function methodValues(input: ReturnType<typeof paymentMethodInputSchema.parse>) {
  const { apiKey, apiSecret, ...rest } = input;
  return {
    ...rest,
    ...(apiKey ? { apiKeyEnc: encrypt(apiKey) } : {}),
    ...(apiSecret ? { apiSecretEnc: encrypt(apiSecret) } : {}),
  };
}

adminPaymentMethodsRouter.post("/", async (req, res) => {
  const input = parse(paymentMethodInputSchema, req.body);
  const [r] = await db.insert(schema.paymentMethods).values(methodValues(input));
  const id = Number(r.insertId);
  await audit(req, "payment_method.create", "payment_method", id, { name: input.name });
  const [m] = await db.select().from(schema.paymentMethods).where(eq(schema.paymentMethods.id, id));
  res.status(201).json(presentMethod(m!));
});

adminPaymentMethodsRouter.patch("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const input = parse(paymentMethodInputSchema, req.body);
  const [r] = await db.update(schema.paymentMethods).set(methodValues(input)).where(eq(schema.paymentMethods.id, id));
  if (!r.affectedRows) throw notFound("Payment method not found");
  const { apiKey, apiSecret, ...logged } = input;
  await audit(req, "payment_method.update", "payment_method", id, { ...logged, keyChanged: Boolean(apiKey || apiSecret) });
  const [m] = await db.select().from(schema.paymentMethods).where(eq(schema.paymentMethods.id, id));
  res.json(presentMethod(m!));
});

/** Removes the saved Binance API key (automatic checks stop). */
adminPaymentMethodsRouter.delete("/:id/api-key", async (req, res) => {
  const id = idParam(req.params.id);
  await db.update(schema.paymentMethods).set({ apiKeyEnc: null, apiSecretEnc: null }).where(eq(schema.paymentMethods.id, id));
  await audit(req, "payment_method.key_removed", "payment_method", id);
  res.json({ ok: true });
});

adminPaymentMethodsRouter.delete("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const [{ n }] = (await db.select({ n: count() }).from(schema.payments).where(eq(schema.payments.methodId, id))) as [{ n: number }];
  if (n > 0) throw conflict("This method has deposits, so it can't be deleted. Turn it off instead.");
  await db.delete(schema.paymentMethods).where(eq(schema.paymentMethods.id, id));
  await audit(req, "payment_method.delete", "payment_method", id);
  res.json({ ok: true });
});


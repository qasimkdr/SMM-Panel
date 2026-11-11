import { Router } from "express";
import { eq, schema } from "@smm/db";
import { updateProfileSchema } from "@smm/shared";
import { randomBytes } from "node:crypto";
import { db } from "../lib/db";
import { redis } from "../lib/redis";
import { notFound } from "../lib/errors";
import { parse } from "../middleware/validate";
import { requireUser } from "../middleware/auth";
import { invalidateUserPricing, userDiscount } from "../services/users";

export const meRouter = Router();
meRouter.use(requireUser);

meRouter.get("/", async (req, res) => {
  const [row] = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      balance: schema.users.balance,
      spent: schema.users.spent,
      currency: schema.users.currency,
      timezone: schema.users.timezone,
      emailVerified: schema.users.emailVerifiedAt,
      referralCode: schema.users.referralCode,
      createdAt: schema.users.createdAt,
      tier: { id: schema.vipTiers.id, name: schema.vipTiers.name, color: schema.vipTiers.color },
    })
    .from(schema.users)
    .leftJoin(schema.vipTiers, eq(schema.vipTiers.id, schema.users.vipTierId))
    .where(eq(schema.users.id, req.auth!.userId))
    .limit(1);
  if (!row) throw notFound("Account not found");
  res.set("Cache-Control", "private, no-store");
  res.json({
    ...row,
    emailVerified: Boolean(row.emailVerified),
    tier: row.tier?.id ? row.tier : null,
    discount: await userDiscount(row.id),
  });
});

meRouter.patch("/", async (req, res) => {
  const input = parse(updateProfileSchema, req.body);
  await db.update(schema.users).set(input).where(eq(schema.users.id, req.auth!.userId));
  await invalidateUserPricing(req.auth!.userId);
  res.json({ ok: true });
});

meRouter.get("/api-key", async (req, res) => {
  const [row] = await db
    .select({ apiKey: schema.users.apiKey })
    .from(schema.users)
    .where(eq(schema.users.id, req.auth!.userId))
    .limit(1);
  res.set("Cache-Control", "private, no-store");
  res.json({ apiKey: row?.apiKey ?? null });
});

meRouter.post("/api-key/regenerate", async (req, res) => {
  const [row] = await db.select({ apiKey: schema.users.apiKey }).from(schema.users).where(eq(schema.users.id, req.auth!.userId)).limit(1);
  const apiKey = randomBytes(24).toString("hex");
  await db.update(schema.users).set({ apiKey }).where(eq(schema.users.id, req.auth!.userId));
  if (row?.apiKey) await redis.del(`apikey:${row.apiKey}`); // old key stops working immediately
  res.json({ apiKey });
});

import { Router } from "express";
import { z } from "zod";
import { verify } from "@node-rs/argon2";
import { and, desc, eq, gt, isNull, newRecoveryCodes, newTotpSecret, otpauthUrl, schema, verifyTotp } from "@smm/db";
import { emailPrefsSchema, twoFactorCodeSchema } from "@smm/shared";
import { db } from "../lib/db";
import { redis } from "../lib/redis";
import { decrypt, encrypt, sha256 } from "../lib/crypto";
import { badRequest, notFound, unauthorized } from "../lib/errors";
import { env } from "../env";
import { parse } from "../middleware/validate";
import { cookieNames, requestScope, requireUser } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { getSetting } from "../lib/settings";

export const securityRouter = Router();
securityRouter.use(requireUser);
const perUser = (name: string, limit: number, windowSec: number) => rateLimit({ name, limit, windowSec, key: (r) => String(r.auth!.userId) });

/** Public session id = first 16 chars of the stored hash (never the token itself). */
securityRouter.get("/", async (req, res) => {
  const userId = req.auth!.userId;
  const current = req.cookies?.[cookieNames(requestScope(req)).refresh] ? sha256(req.cookies[cookieNames(requestScope(req)).refresh]) : null;
  const [[u], sessions, logins] = await Promise.all([
    db.select({ twoFactorEnabled: schema.users.twoFactorEnabled, emailPrefs: schema.users.emailPrefs, hasPassword: schema.users.passwordHash, googleId: schema.users.googleId, recoveryCodes: schema.users.recoveryCodes }).from(schema.users).where(eq(schema.users.id, userId)),
    db
      .select()
      .from(schema.sessions)
      .where(and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, new Date())))
      .orderBy(desc(schema.sessions.createdAt))
      .limit(20),
    db.select().from(schema.loginEvents).where(eq(schema.loginEvents.userId, userId)).orderBy(desc(schema.loginEvents.id)).limit(15),
  ]);
  res.set("Cache-Control", "private, no-store");
  res.json({
    twoFactorEnabled: u!.twoFactorEnabled,
    recoveryCodesLeft: u!.recoveryCodes?.length ?? 0,
    hasPassword: Boolean(u!.hasPassword),
    googleLinked: Boolean(u!.googleId),
    emailPrefs: { orders: u!.emailPrefs?.orders !== false, tickets: u!.emailPrefs?.tickets !== false, news: u!.emailPrefs?.news === true },
    sessions: sessions.map((s) => ({ id: s.id.slice(0, 16), scope: s.scope, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt, current: s.id === current })),
    logins: logins.map((l) => ({ id: l.id, ip: l.ip, userAgent: l.userAgent, success: l.success, createdAt: l.createdAt })),
  });
});

securityRouter.delete("/sessions/:id", async (req, res) => {
  const prefix = String(req.params.id);
  if (!/^[a-f0-9]{16}$/.test(prefix)) throw notFound();
  const rows = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, req.auth!.userId), isNull(schema.sessions.revokedAt)));
  const target = rows.find((r) => r.id.startsWith(prefix));
  if (!target) throw notFound("Session not found");
  await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.id, target.id));
  res.json({ ok: true });
});

securityRouter.put("/email-prefs", async (req, res) => {
  const prefs = parse(emailPrefsSchema, req.body);
  await db.update(schema.users).set({ emailPrefs: prefs }).where(eq(schema.users.id, req.auth!.userId));
  res.json({ ok: true });
});

/* ── Two-factor authentication (TOTP) ── */

/** Step 1: create a secret (held in Redis for 10 min until confirmed). */
securityRouter.post("/2fa/setup", perUser("2fa-setup", 10, 3600), async (req, res) => {
  const [u] = await db.select({ email: schema.users.email, on: schema.users.twoFactorEnabled }).from(schema.users).where(eq(schema.users.id, req.auth!.userId));
  if (u!.on) throw badRequest("Two-factor sign-in is already on");
  const secret = newTotpSecret();
  await redis.set(`2fa:setup:${req.auth!.userId}`, encrypt(secret), "EX", 600);
  const issuer = String(await getSetting("site.name", env.APP_NAME));
  res.json({ secret, otpauth: otpauthUrl(secret, u!.email, issuer) });
});

/** Step 2: confirm with a code from the app → turn on, return one-time recovery codes. */
securityRouter.post("/2fa/enable", perUser("2fa-enable", 10, 900), async (req, res) => {
  const { code } = parse(twoFactorCodeSchema, req.body);
  const enc = await redis.get(`2fa:setup:${req.auth!.userId}`);
  if (!enc) throw badRequest("Setup expired. Start again.");
  const secret = decrypt(enc);
  if (!verifyTotp(secret, code)) throw badRequest("That code didn't match. Check your phone's time and try the newest code.", { code: "Code didn't match" });
  const codes = newRecoveryCodes();
  await db
    .update(schema.users)
    .set({ twoFactorSecret: encrypt(secret), twoFactorEnabled: true, recoveryCodes: codes.map((c) => sha256(c)) })
    .where(eq(schema.users.id, req.auth!.userId));
  await redis.del(`2fa:setup:${req.auth!.userId}`);
  res.json({ ok: true, recoveryCodes: codes });
});

securityRouter.post("/2fa/disable", perUser("2fa-disable", 10, 900), async (req, res) => {
  const { password, code } = parse(z.object({ password: z.string().min(1, "Enter your password"), code: z.string().trim().min(6, "Enter a code") }), req.body);
  const [u] = await db.select({ hash: schema.users.passwordHash, secret: schema.users.twoFactorSecret, codes: schema.users.recoveryCodes }).from(schema.users).where(eq(schema.users.id, req.auth!.userId));
  if (!u?.hash || !(await verify(u.hash, password).catch(() => false))) throw unauthorized("Password is incorrect");
  const ok = (u.secret && verifyTotp(decrypt(u.secret), code)) || (u.codes ?? []).includes(sha256(code.toLowerCase()));
  if (!ok) throw badRequest("That code didn't match", { code: "Code didn't match" });
  await db.update(schema.users).set({ twoFactorEnabled: false, twoFactorSecret: null, recoveryCodes: null }).where(eq(schema.users.id, req.auth!.userId));
  res.json({ ok: true });
});

securityRouter.post("/2fa/recovery-codes", perUser("2fa-recovery", 5, 3600), async (req, res) => {
  const { code } = parse(twoFactorCodeSchema, req.body);
  const [u] = await db.select({ secret: schema.users.twoFactorSecret, on: schema.users.twoFactorEnabled }).from(schema.users).where(eq(schema.users.id, req.auth!.userId));
  if (!u?.on || !u.secret || !verifyTotp(decrypt(u.secret), code)) throw badRequest("That code didn't match", { code: "Code didn't match" });
  const codes = newRecoveryCodes();
  await db.update(schema.users).set({ recoveryCodes: codes.map((c) => sha256(c)) }).where(eq(schema.users.id, req.auth!.userId));
  res.json({ recoveryCodes: codes });
});

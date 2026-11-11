import { Router } from "express";
import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or, schema } from "@smm/db";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@smm/shared";
import { db } from "../lib/db";
import { redis } from "../lib/redis";
import { randomToken, sha256 } from "../lib/crypto";
import { badRequest, conflict, forbidden, HttpError, unauthorized } from "../lib/errors";
import { mailTemplates, sendMail } from "../lib/mail";
import { getSetting } from "../lib/settings";
import { env } from "../env";
import { parse } from "../middleware/validate";
import { rateLimit } from "../middleware/rateLimit";
import { requestScope, requireUser } from "../middleware/auth";
import { clearCookies, issueSession, revokeAll, revokeCurrent, rotateSession } from "../services/session";

export const authRouter = Router();

// Dummy hash so unknown accounts take the same time as known ones (no user enumeration by timing).
const DUMMY_HASH = await hash("timing-safe-dummy-password");

const ipLimit = (name: string, limit: number, windowSec: number) => rateLimit({ name, limit, windowSec });

async function createEmailToken(userId: number, type: "verify" | "reset", ttlMs: number) {
  const token = randomToken(32);
  await db.insert(schema.emailTokens).values({
    userId,
    type,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

async function sendVerification(userId: number, email: string) {
  const token = await createEmailToken(userId, "verify", 24 * 3600_000);
  const t = mailTemplates.verify(`${env.WEB_URL}/verify-email?token=${token}`);
  await sendMail(email, t.subject, t.html, t.text);
}

authRouter.post("/register", ipLimit("register", 5, 3600), async (req, res) => {
  if (requestScope(req) === "admin") throw forbidden("Sign up on the main site");
  if (!(await getSetting("auth.registrationOpen", true))) throw forbidden("Sign-ups are closed right now");
  const input = parse(registerSchema, req.body);

  const clash = await db
    .select({ email: schema.users.email, username: schema.users.username })
    .from(schema.users)
    .where(or(eq(schema.users.email, input.email), eq(schema.users.username, input.username)))
    .limit(2);
  if (clash.length) {
    const fields: Record<string, string> = {};
    if (clash.some((c) => c.email === input.email)) fields.email = "An account with this email already exists";
    if (clash.some((c) => c.username.toLowerCase() === input.username.toLowerCase()))
      fields.username = "This username is taken";
    throw conflict("Some details are already in use", fields);
  }

  let referredBy: number | null = null;
  if (input.referralCode) {
    const [ref] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.referralCode, input.referralCode))
      .limit(1);
    referredBy = ref?.id ?? null;
  }

  const [result] = await db.insert(schema.users).values({
    username: input.username,
    email: input.email,
    passwordHash: await hash(input.password),
    currency: input.currency,
    referralCode: randomBytes(5).toString("hex"),
    apiKey: randomBytes(24).toString("hex"),
    referredBy,
  });
  const userId = Number(result.insertId);

  await sendVerification(userId, input.email);
  const session = await issueSession(req, res, { id: userId, role: "user" }, "user");
  res.status(201).json({ ok: true, ...session });
});

authRouter.post("/login", ipLimit("login", 20, 60), async (req, res) => {
  const scope = requestScope(req);
  const input = parse(loginSchema, req.body);
  const login = input.login.toLowerCase();

  const lockKey = `loginfail:${login}`;
  const fails = Number((await redis.get(lockKey)) ?? 0);
  if (fails >= 8) throw new HttpError(429, "locked", "Too many failed attempts. Try again in 15 minutes.");

  const [user] = await db
    .select({
      id: schema.users.id,
      role: schema.users.role,
      status: schema.users.status,
      passwordHash: schema.users.passwordHash,
    })
    .from(schema.users)
    .where(input.login.includes("@") ? eq(schema.users.email, login) : eq(schema.users.username, input.login))
    .limit(1);

  const ok = await verify(user?.passwordHash ?? DUMMY_HASH, input.password).catch(() => false);
  if (user)
    await db.insert(schema.loginEvents).values({
      userId: user.id,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent")?.slice(0, 255) ?? null,
      success: ok,
    });

  if (!user || !ok) {
    await redis.multi().incr(lockKey).expire(lockKey, 900).exec();
    throw unauthorized("Email/username or password is incorrect");
  }
  if (user.status === "banned") throw forbidden("This account is suspended. Contact support.");
  if (scope === "admin" && user.role === "user") throw forbidden("This account can't access the admin panel");

  await redis.del(lockKey);
  await db
    .update(schema.users)
    .set({ lastLoginAt: new Date(), lastLoginIp: req.ip ?? null })
    .where(eq(schema.users.id, user.id));
  const session = await issueSession(req, res, { id: user.id, role: user.role }, scope);
  res.json({ ok: true, ...session });
});

authRouter.post("/refresh", ipLimit("refresh", 60, 60), async (req, res) => {
  const scope = requestScope(req);
  const session = await rotateSession(req, res, scope);
  if (!session) {
    clearCookies(res, scope);
    throw unauthorized("Your session has ended. Please sign in again.");
  }
  res.json({ ok: true, ...session });
});

authRouter.post("/logout", async (req, res) => {
  const scope = requestScope(req);
  await revokeCurrent(req, scope);
  clearCookies(res, scope);
  res.json({ ok: true });
});

authRouter.post("/logout-all", requireUser, async (req, res) => {
  await revokeAll(req.auth!.userId);
  clearCookies(res, requestScope(req));
  res.json({ ok: true });
});

authRouter.post("/verify-email", ipLimit("verify", 20, 3600), async (req, res) => {
  const { token } = parse(verifyEmailSchema, req.body);
  const [row] = await db
    .select()
    .from(schema.emailTokens)
    .where(
      and(
        eq(schema.emailTokens.tokenHash, sha256(token)),
        eq(schema.emailTokens.type, "verify"),
        isNull(schema.emailTokens.usedAt),
        gt(schema.emailTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) throw badRequest("This link is invalid or has expired. Request a new one from your account.");
  await db.transaction(async (tx) => {
    await tx.update(schema.emailTokens).set({ usedAt: new Date() }).where(eq(schema.emailTokens.id, row.id));
    await tx.update(schema.users).set({ emailVerifiedAt: new Date() }).where(eq(schema.users.id, row.userId));
  });
  res.json({ ok: true });
});

authRouter.post(
  "/resend-verification",
  requireUser,
  rateLimit({ name: "resend", limit: 3, windowSec: 3600, key: (r) => String(r.auth?.userId) }),
  async (req, res) => {
    const [u] = await db
      .select({ email: schema.users.email, verified: schema.users.emailVerifiedAt })
      .from(schema.users)
      .where(eq(schema.users.id, req.auth!.userId))
      .limit(1);
    if (u && !u.verified) await sendVerification(req.auth!.userId, u.email);
    res.json({ ok: true });
  },
);

authRouter.post("/forgot-password", ipLimit("forgot", 5, 3600), async (req, res) => {
  const { email } = parse(forgotPasswordSchema, req.body);
  const [u] = await db
    .select({ id: schema.users.id, status: schema.users.status })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (u && u.status === "active") {
    const token = await createEmailToken(u.id, "reset", 3600_000);
    const t = mailTemplates.reset(`${env.WEB_URL}/reset-password?token=${token}`);
    await sendMail(email, t.subject, t.html, t.text);
  }
  // Same response either way, so nobody can test which emails have accounts.
  res.json({ ok: true });
});

authRouter.post("/reset-password", ipLimit("reset", 10, 3600), async (req, res) => {
  const { token, password } = parse(resetPasswordSchema, req.body);
  const [row] = await db
    .select()
    .from(schema.emailTokens)
    .where(
      and(
        eq(schema.emailTokens.tokenHash, sha256(token)),
        eq(schema.emailTokens.type, "reset"),
        isNull(schema.emailTokens.usedAt),
        gt(schema.emailTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) throw badRequest("This reset link is invalid or has expired. Request a new one.");
  const passwordHash = await hash(password);
  await db.transaction(async (tx) => {
    await tx.update(schema.emailTokens).set({ usedAt: new Date() }).where(eq(schema.emailTokens.id, row.id));
    await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, row.userId));
  });
  await revokeAll(row.userId); // sign out everywhere after a reset
  res.json({ ok: true });
});

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or, schema, verifyTotp } from "@smm/db";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@smm/shared";
import { db } from "../lib/db";
import { redis } from "../lib/redis";
import { decrypt, randomToken, sha256 } from "../lib/crypto";
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
      twoFactorEnabled: schema.users.twoFactorEnabled,
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
  if (user.twoFactorEnabled) {
    // Password was right; now ask for the authenticator code. The challenge is single-use and short-lived.
    const challenge = await createTwoFactorChallenge(user.id, user.role, scope);
    res.json({ ok: true, twoFactorRequired: true, challenge });
    return;
  }
  await finishLogin(req, res, user.id, user.role, scope);
});

async function createTwoFactorChallenge(userId: number, role: "user" | "staff" | "admin", scope: "user" | "admin") {
  const challenge = randomToken(24);
  await redis.set(`2fa:login:${challenge}`, JSON.stringify({ userId, role, scope, tries: 0 }), "EX", 300);
  return challenge;
}

async function finishLogin(req: Request, res: Response, userId: number, role: "user" | "staff" | "admin", scope: "user" | "admin") {
  await db.update(schema.users).set({ lastLoginAt: new Date(), lastLoginIp: req.ip ?? null }).where(eq(schema.users.id, userId));
  const session = await issueSession(req, res, { id: userId, role }, scope);
  res.json({ ok: true, ...session });
}

/** Second step: authenticator code or a one-time recovery code. 5 tries per challenge. */
authRouter.post("/login/2fa", ipLimit("login-2fa", 30, 600), async (req, res) => {
  const { challenge, code } = parse(z.object({ challenge: z.string().min(20).max(64), code: z.string().trim().min(6, "Enter the 6-digit code").max(12) }), req.body);
  const key = `2fa:login:${challenge}`;
  const raw = await redis.get(key);
  if (!raw) throw unauthorized("This sign-in attempt expired. Enter your password again.");
  const c = JSON.parse(raw) as { userId: number; role: "user" | "staff" | "admin"; scope: "user" | "admin"; tries: number };
  if (c.scope !== requestScope(req)) throw forbidden();
  const [u] = await db.select({ secret: schema.users.twoFactorSecret, codes: schema.users.recoveryCodes, status: schema.users.status }).from(schema.users).where(eq(schema.users.id, c.userId)).limit(1);
  if (!u || u.status !== "active") throw forbidden("This account is suspended. Contact support.");
  const recovery = (u.codes ?? []).indexOf(sha256(code.toLowerCase()));
  const ok = (u.secret && verifyTotp(decrypt(u.secret), code)) || recovery >= 0;
  if (!ok) {
    c.tries++;
    if (c.tries >= 5) await redis.del(key);
    else await redis.set(key, JSON.stringify(c), "KEEPTTL");
    throw badRequest(c.tries >= 5 ? "Too many wrong codes. Enter your password again." : "That code didn't match", { code: "Code didn't match" });
  }
  await redis.del(key);
  if (recovery >= 0) {
    const left = [...(u.codes ?? [])];
    left.splice(recovery, 1); // recovery codes work once
    await db.update(schema.users).set({ recoveryCodes: left }).where(eq(schema.users.id, c.userId));
  }
  await finishLogin(req, res, c.userId, c.role, c.scope);
});

/* ── Sign in with Google (OAuth 2.0 authorization code flow, customer site only) ── */

const googleRedirectUri = () => `${env.WEB_URL}/api/auth/google/callback`;

authRouter.get("/google", async (req, res) => {
  if (!(await getSetting("auth.googleEnabled", false)) || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
    return res.redirect(`${env.WEB_URL}/login?error=google_off`);
  const state = randomToken(24);
  const next = typeof req.query.next === "string" && req.query.next.startsWith("/") && !req.query.next.startsWith("//") ? req.query.next : "/dashboard";
  const ref = typeof req.query.ref === "string" ? req.query.ref.slice(0, 16) : "";
  await redis.set(`oauth:google:${state}`, JSON.stringify({ next, ref }), "EX", 600);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

authRouter.get("/google/callback", ipLimit("google-cb", 30, 600), async (req, res) => {
  const fail = (code: string) => res.redirect(`${env.WEB_URL}/login?error=${code}`);
  const state = String(req.query.state ?? "");
  const saved = state ? await redis.getdel(`oauth:google:${state}`) : null; // single use, blocks CSRF/replay
  if (!saved || typeof req.query.code !== "string") return fail("google_state");
  const { next, ref } = JSON.parse(saved) as { next: string; ref: string };
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: req.query.code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: googleRedirectUri(), grant_type: "authorization_code" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenRes.ok) return fail("google_token");
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(10_000) });
    if (!infoRes.ok) return fail("google_profile");
    const info = (await infoRes.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string };
    if (!info.email || !info.email_verified) return fail("google_unverified");
    const email = info.email.toLowerCase();

    let [user] = await db
      .select({ id: schema.users.id, role: schema.users.role, status: schema.users.status, googleId: schema.users.googleId, twoFactorEnabled: schema.users.twoFactorEnabled })
      .from(schema.users)
      .where(or(eq(schema.users.googleId, info.sub), eq(schema.users.email, email)))
      .limit(1);
    if (user && !user.googleId) await db.update(schema.users).set({ googleId: info.sub, emailVerifiedAt: new Date() }).where(eq(schema.users.id, user.id));
    if (!user) {
      if (!(await getSetting("auth.registrationOpen", true))) return fail("signups_closed");
      const base = email.split("@")[0]!.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24) || "user";
      let username = base.length >= 3 ? base : `${base}user`;
      for (let i = 0; i < 5; i++) {
        const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, username)).limit(1);
        if (!taken) break;
        username = `${base.slice(0, 24)}${randomBytes(2).toString("hex")}`;
      }
      let referredBy: number | null = null;
      if (ref) {
        const [r] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.referralCode, ref)).limit(1);
        referredBy = r?.id ?? null;
      }
      const [r] = await db.insert(schema.users).values({
        username,
        email,
        name: info.name?.slice(0, 80) ?? null,
        googleId: info.sub,
        emailVerifiedAt: new Date(),
        referralCode: randomBytes(5).toString("hex"),
        apiKey: randomBytes(24).toString("hex"),
        referredBy,
      });
      user = { id: Number(r.insertId), role: "user", status: "active", googleId: info.sub, twoFactorEnabled: false };
    }
    if (user.status !== "active") return fail("banned");
    await db.insert(schema.loginEvents).values({ userId: user.id, ip: req.ip ?? null, userAgent: req.get("user-agent")?.slice(0, 255) ?? null, success: true });
    if (user.twoFactorEnabled) {
      const challenge = await createTwoFactorChallenge(user.id, user.role, "user");
      return res.redirect(`${env.WEB_URL}/login?challenge=${challenge}&next=${encodeURIComponent(next)}`);
    }
    await db.update(schema.users).set({ lastLoginAt: new Date(), lastLoginIp: req.ip ?? null }).where(eq(schema.users.id, user.id));
    await issueSession(req, res, { id: user.id, role: user.role }, "user");
    res.redirect(`${env.WEB_URL}${next}`);
  } catch {
    return fail("google_error");
  }
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

/** Exchanges a one-time admin "sign in as" token for a customer session. */
authRouter.post("/impersonate", ipLimit("impersonate", 20, 3600), async (req, res) => {
  if (requestScope(req) === "admin") throw forbidden();
  const { token } = parse(z.object({ token: z.string().min(20).max(100) }), req.body);
  const raw = await redis.getdel(`imp:${token}`); // single use
  if (!raw) throw badRequest("This sign-in link has expired. Start again from the admin panel.");
  const { userId, adminId } = JSON.parse(raw) as { userId: number; adminId: number };
  await db.insert(schema.adminLogs).values({ actorId: adminId, action: "user.impersonate.used", targetType: "user", targetId: String(userId), ip: req.ip ?? null });
  const session = await issueSession(req, res, { id: userId, role: "user" }, "user");
  res.json({ ok: true, ...session });
});

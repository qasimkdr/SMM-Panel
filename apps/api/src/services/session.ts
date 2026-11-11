import type { Request, Response } from "express";
import { and, eq, isNull, schema } from "@smm/db";
import { db } from "../lib/db";
import { randomToken, sha256 } from "../lib/crypto";
import { ACCESS_TTL_SEC, signAccess } from "../lib/jwt";
import { cookieNames } from "../middleware/auth";
import { isProd } from "../env";

export const REFRESH_TTL_DAYS = 30;
const COOKIE_PATH_REFRESH = "/api/auth";

type Scope = "user" | "admin";
type SessionUser = { id: number; role: "user" | "staff" | "admin" };

function setCookies(res: Response, scope: Scope, access: string, refresh?: string) {
  const names = cookieNames(scope);
  const base = { httpOnly: true, secure: isProd, sameSite: "lax" as const };
  res.cookie(names.access, access, { ...base, path: "/", maxAge: ACCESS_TTL_SEC * 1000 });
  if (refresh)
    res.cookie(names.refresh, refresh, {
      ...base,
      path: COOKIE_PATH_REFRESH,
      maxAge: REFRESH_TTL_DAYS * 86_400_000,
    });
}

export function clearCookies(res: Response, scope: Scope) {
  const names = cookieNames(scope);
  res.clearCookie(names.access, { path: "/" });
  res.clearCookie(names.refresh, { path: COOKIE_PATH_REFRESH });
}

export async function issueSession(req: Request, res: Response, user: SessionUser, scope: Scope) {
  const refresh = randomToken(48);
  const id = sha256(refresh);
  await db.insert(schema.sessions).values({
    id,
    userId: user.id,
    scope,
    ip: req.ip ?? null,
    userAgent: req.get("user-agent")?.slice(0, 255) ?? null,
    expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000),
  });
  const access = await signAccess({ sub: String(user.id), role: user.role, scope, sid: id.slice(0, 16) });
  setCookies(res, scope, access, refresh);
  return { accessToken: access, expiresIn: ACCESS_TTL_SEC };
}

/** Rotates the refresh token. Detects token reuse and revokes every session of that user. */
export async function rotateSession(req: Request, res: Response, scope: Scope) {
  const token: string | undefined = req.cookies?.[cookieNames(scope).refresh];
  if (!token) return null;
  const id = sha256(token);
  const [row] = await db
    .select({ s: schema.sessions, role: schema.users.role, status: schema.users.status })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.id, id))
    .limit(1);

  if (!row || row.s.scope !== scope) return null;
  if (row.s.revokedAt) {
    // A rotated token was used again. Small grace window covers two tabs refreshing at once.
    if (Date.now() - row.s.revokedAt.getTime() > 30_000) await revokeAll(row.s.userId);
    return null;
  }
  if (row.s.expiresAt.getTime() < Date.now() || row.status !== "active") return null;
  if (scope === "admin" && row.role === "user") return null;

  await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.id, id));
  return issueSession(req, res, { id: row.s.userId, role: row.role }, scope);
}

export async function revokeCurrent(req: Request, scope: Scope) {
  const token: string | undefined = req.cookies?.[cookieNames(scope).refresh];
  if (!token) return;
  await db
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.sessions.id, sha256(token)), isNull(schema.sessions.revokedAt)));
}

export async function revokeAll(userId: number) {
  await db
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt)));
}

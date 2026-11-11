import type { NextFunction, Request, Response } from "express";
import { env } from "../env";
import { verifyAccess, type AccessClaims } from "../lib/jwt";
import { forbidden, unauthorized } from "../lib/errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessClaims & { userId: number };
    }
  }
}

/** Requests from admin.<domain> get the admin scope and admin-only cookies. */
export function requestScope(req: Request): "user" | "admin" {
  const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  return host === env.ADMIN_DOMAIN.toLowerCase() ? "admin" : "user";
}

export const cookieNames = (scope: "user" | "admin") =>
  scope === "admin" ? { access: "a_at", refresh: "a_rt" } : { access: "at", refresh: "rt" };

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const scope = requestScope(req);
  const header = req.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.[cookieNames(scope).access];
  if (token) {
    const claims = await verifyAccess(token);
    if (claims && claims.scope === scope) req.auth = { ...claims, userId: Number(claims.sub) };
  }
  next();
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw unauthorized();
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw unauthorized();
  if (req.auth.scope !== "admin" || (req.auth.role !== "admin" && req.auth.role !== "staff")) throw forbidden();
  next();
}

/** CSRF defence for cookie auth: state-changing requests must come from our own origins. */
export function sameOrigin(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("authorization")) return next(); // bearer tokens aren't sent automatically
  const origin = req.get("origin");
  if (!origin) return next(); // non-browser clients
  const host = new URL(origin).host.toLowerCase();
  const allowed = [env.PUBLIC_DOMAIN, env.ADMIN_DOMAIN, new URL(env.WEB_URL).host].map((h) => h.toLowerCase());
  if (!allowed.includes(host)) throw forbidden("Cross-site request blocked");
  next();
}

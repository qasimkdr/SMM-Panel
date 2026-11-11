import { SignJWT, jwtVerify } from "jose";
import { env } from "../env";

const secret = new TextEncoder().encode(env.JWT_SECRET);
export const ACCESS_TTL_SEC = 15 * 60;

export interface AccessClaims {
  sub: string; // user id
  role: "user" | "staff" | "admin";
  scope: "user" | "admin";
  sid: string; // session id prefix (for revocation checks if needed)
}

export async function signAccess(claims: AccessClaims): Promise<string> {
  return new SignJWT({ role: claims.role, scope: claims.scope, sid: claims.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(secret);
}

export async function verifyAccess(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return {
      sub: String(payload.sub),
      role: payload.role as AccessClaims["role"],
      scope: payload.scope as AccessClaims["scope"],
      sid: String(payload.sid),
    };
  } catch {
    return null;
  }
}

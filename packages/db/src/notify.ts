import { eq } from "drizzle-orm";
import type { Database } from "./client";
import { notifications, users } from "./schema";

export type NotificationKind = "order" | "ticket" | "balance" | "affiliate" | "child_panel" | "account";

export interface NotifyInput {
  userId: number;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  href?: string | null;
}

/** Writes an in-app notification. Returns the user's email + preferences so callers can decide on email. */
export async function notify(db: Database, n: NotifyInput) {
  await db.insert(notifications).values({
    userId: n.userId,
    kind: n.kind,
    title: n.title.slice(0, 160),
    body: n.body?.slice(0, 500) ?? null,
    href: n.href ?? null,
  });
  const [u] = await db
    .select({ email: users.email, username: users.username, prefs: users.emailPrefs, status: users.status })
    .from(users)
    .where(eq(users.id, n.userId))
    .limit(1);
  return u ?? null;
}

/** Email preference check (defaults: orders and tickets on). */
export function wantsEmail(prefs: { orders?: boolean; tickets?: boolean; news?: boolean } | null | undefined, kind: "orders" | "tickets" | "news") {
  const p = prefs ?? {};
  if (kind === "news") return p.news === true;
  return p[kind] !== false;
}

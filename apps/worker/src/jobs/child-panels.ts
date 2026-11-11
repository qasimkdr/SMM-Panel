import { and, applyBalanceChange, BalanceError, eq, lte, notify, schema, sql } from "@smm/db";
import { db, logger } from "../lib";
import { emailQueue } from "../mail";

/**
 * Daily: renew active child panels that expire within 24 h. The monthly price is charged from the
 * owner's balance (ledger, row-locked); if the balance is short or auto-renew is off, the panel is
 * suspended at expiry and the owner is told.
 */
export async function renewChildPanels() {
  const due = await db
    .select()
    .from(schema.childPanels)
    .where(and(eq(schema.childPanels.status, "active"), lte(schema.childPanels.expiresAt, sql`NOW() + INTERVAL 1 DAY`)));
  let renewed = 0;
  let suspended = 0;
  for (const p of due) {
    const expired = p.expiresAt!.getTime() <= Date.now();
    if (p.autoRenew) {
      try {
        await db.transaction(async (tx) => {
          await applyBalanceChange(tx, { userId: p.userId, amount: `-${p.price}`, type: "child_panel", refType: "child_panel", refId: p.id, note: `Child panel ${p.domain}: 1 month` });
          const from = Math.max(Date.now(), p.expiresAt!.getTime());
          await tx.update(schema.childPanels).set({ expiresAt: new Date(from + 30 * 86_400_000) }).where(eq(schema.childPanels.id, p.id));
        });
        renewed++;
        await notify(db, { userId: p.userId, kind: "child_panel", title: `${p.domain} renewed for 30 days`, body: `$${Number(p.price).toFixed(2)} was charged from your balance.`, href: "/dashboard/child-panel" });
        continue;
      } catch (e) {
        if (!(e instanceof BalanceError)) throw e;
      }
    }
    if (expired) {
      await db.update(schema.childPanels).set({ status: "suspended" }).where(eq(schema.childPanels.id, p.id));
      suspended++;
      const u = await notify(db, {
        userId: p.userId,
        kind: "child_panel",
        title: `${p.domain} is suspended`,
        body: p.autoRenew ? "Your balance was too low to renew it. Add balance and contact support to reactivate." : "Auto-renew was off. Contact support to reactivate.",
        href: "/dashboard/child-panel",
      });
      if (u) await emailQueue.add("child_panel", { to: u.email, subject: `${p.domain} is suspended`, title: `${p.domain} is suspended`, lines: ["Your child panel couldn't be renewed."], cta: { label: "Open your account", path: "/dashboard/child-panel" } });
    }
  }
  if (due.length) logger.info({ renewed, suspended }, "child panel renewals");
  return { renewed, suspended };
}

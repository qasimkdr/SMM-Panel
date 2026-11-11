import { notify, wantsEmail } from "@smm/db";
import { db } from "../lib";
import { emailQueue } from "../mail";

const money = (v: string) => `$${Number(v).toFixed(2)}`;

/** In-app notification + (if the customer wants it) an email when an order reaches a final state. */
export async function notifyOrderFinal(o: { id: number; userId: number; status: string; refunded?: string | null; serviceName?: string | null }) {
  const label = o.serviceName ? ` (${o.serviceName})` : "";
  const refunded = o.refunded && Number(o.refunded) > 0 ? ` ${money(o.refunded)} was returned to your balance.` : "";
  const content =
    o.status === "completed"
      ? { title: `Order #${o.id} completed`, body: `Your order${label} has been delivered.` }
      : o.status === "partial"
        ? { title: `Order #${o.id} partly delivered`, body: `Part of your order${label} couldn't be delivered.${refunded}` }
        : { title: `Order #${o.id} canceled`, body: `Your order${label} was canceled.${refunded}` };
  const u = await notify(db, { userId: o.userId, kind: "order", title: content.title, body: content.body, href: "/dashboard/orders" });
  if (u && u.status === "active" && wantsEmail(u.prefs, "orders")) {
    await emailQueue.add("order", {
      to: u.email,
      subject: content.title,
      title: content.title,
      lines: [`Hi ${u.username},`, content.body],
      cta: { label: "View your orders", path: "/dashboard/orders" },
    });
  }
}

export async function notifyAffiliate(referrerId: number, amount: string, orderId: number) {
  await notify(db, {
    userId: referrerId,
    kind: "affiliate",
    title: `You earned ${money(amount)} commission`,
    body: `From a referred customer's order #${orderId}.`,
    href: "/dashboard/affiliates",
  });
}

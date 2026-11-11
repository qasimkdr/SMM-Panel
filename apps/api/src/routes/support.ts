import { Router } from "express";
import { z } from "zod";
import { and, asc, count, desc, eq, isNull, lt, notify, schema, sql, wantsEmail, type SQL } from "@smm/db";
import { ticketCreateSchema, ticketReplySchema } from "@smm/shared";
import { db } from "../lib/db";
import { badRequest, notFound } from "../lib/errors";
import { enqueueEmail } from "../lib/queues";
import { parse } from "../middleware/validate";
import { requirePerm, requireUser } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { audit } from "../services/audit";

const perUser = (name: string, limit: number, windowSec: number) => rateLimit({ name, limit, windowSec, key: (r) => String(r.auth!.userId) });

/* ───────────── Customer: support tickets ───────────── */
export const ticketsRouter = Router();
ticketsRouter.use(requireUser);

ticketsRouter.get("/", async (req, res) => {
  const rows = await db
    .select({ id: schema.tickets.id, subject: schema.tickets.subject, topic: schema.tickets.topic, status: schema.tickets.status, lastReplyAt: schema.tickets.lastReplyAt, createdAt: schema.tickets.createdAt })
    .from(schema.tickets)
    .where(eq(schema.tickets.userId, req.auth!.userId))
    .orderBy(desc(schema.tickets.lastReplyAt))
    .limit(100);
  res.set("Cache-Control", "private, no-store");
  res.json(rows);
});

async function loadThread(ticketId: number, userId: number | null) {
  const [t] = await db
    .select()
    .from(schema.tickets)
    .where(and(eq(schema.tickets.id, ticketId), ...(userId ? [eq(schema.tickets.userId, userId)] : [])))
    .limit(1);
  if (!t) throw notFound("Ticket not found");
  const messages = await db
    .select({ id: schema.ticketMessages.id, body: schema.ticketMessages.body, isStaff: schema.ticketMessages.isStaff, createdAt: schema.ticketMessages.createdAt, author: schema.users.username })
    .from(schema.ticketMessages)
    .leftJoin(schema.users, eq(schema.users.id, schema.ticketMessages.userId))
    .where(eq(schema.ticketMessages.ticketId, ticketId))
    .orderBy(asc(schema.ticketMessages.id));
  return { ...t, messages: messages.map((m) => ({ ...m, author: m.isStaff ? "Support" : m.author })) };
}

ticketsRouter.get("/:id", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  res.json(await loadThread(Number(req.params.id), req.auth!.userId));
});

ticketsRouter.post("/", perUser("ticket", 5, 3600), async (req, res) => {
  const input = parse(ticketCreateSchema, req.body);
  const [{ open }] = (await db
    .select({ open: count() })
    .from(schema.tickets)
    .where(and(eq(schema.tickets.userId, req.auth!.userId), sql`${schema.tickets.status} <> 'closed'`))) as [{ open: number }];
  if (open >= 10) throw badRequest("You have 10 open tickets. Please wait for replies or close some first.");
  const id = await db.transaction(async (tx) => {
    const [r] = await tx.insert(schema.tickets).values({
      userId: req.auth!.userId,
      subject: input.subject,
      topic: input.topic,
      orderIds: input.orderIds?.replace(/[#\s]/g, "") || null,
    });
    const ticketId = Number(r.insertId);
    await tx.insert(schema.ticketMessages).values({ ticketId, userId: req.auth!.userId, body: input.message });
    return ticketId;
  });
  res.status(201).json({ ok: true, id });
});

ticketsRouter.post("/:id/reply", perUser("ticket-reply", 30, 3600), async (req, res) => {
  const id = Number(req.params.id);
  const { message } = parse(ticketReplySchema, req.body);
  const t = await loadThread(id, req.auth!.userId);
  if (t.status === "closed") throw badRequest("This ticket is closed. Open a new one if you still need help.");
  await db.insert(schema.ticketMessages).values({ ticketId: id, userId: req.auth!.userId, body: message });
  await db.update(schema.tickets).set({ status: "customer_reply", lastReplyAt: new Date() }).where(eq(schema.tickets.id, id));
  res.json({ ok: true });
});

ticketsRouter.post("/:id/close", async (req, res) => {
  const id = Number(req.params.id);
  await loadThread(id, req.auth!.userId);
  await db.update(schema.tickets).set({ status: "closed" }).where(eq(schema.tickets.id, id));
  res.json({ ok: true });
});

/* ───────────── Customer: notifications ───────────── */
export const notificationsRouter = Router();
notificationsRouter.use(requireUser);

notificationsRouter.get("/", async (req, res) => {
  const cursor = Number(req.query.cursor) || 0;
  const conds: SQL[] = [eq(schema.notifications.userId, req.auth!.userId)];
  if (cursor) conds.push(lt(schema.notifications.id, cursor));
  const [items, [unread]] = await Promise.all([
    db.select().from(schema.notifications).where(and(...conds)).orderBy(desc(schema.notifications.id)).limit(21),
    db.select({ n: count() }).from(schema.notifications).where(and(eq(schema.notifications.userId, req.auth!.userId), isNull(schema.notifications.readAt))),
  ]);
  res.set("Cache-Control", "private, no-store");
  res.json({ items: items.slice(0, 20), nextCursor: items.length > 20 ? items[19]!.id : null, unread: unread!.n });
});

notificationsRouter.post("/read", async (req, res) => {
  const { id } = parse(z.object({ id: z.number().int().positive().optional() }), req.body ?? {});
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, req.auth!.userId), isNull(schema.notifications.readAt), ...(id ? [eq(schema.notifications.id, id)] : [])));
  res.json({ ok: true });
});

/* ───────────── Admin: ticket inbox + canned replies ───────────── */
export const adminTicketsRouter = Router();
adminTicketsRouter.use(requirePerm("support"));

adminTicketsRouter.get("/", async (req, res) => {
  const q = parse(z.object({ status: z.enum(["waiting", "open", "answered", "customer_reply", "closed", "all"]).default("waiting"), cursor: z.coerce.number().int().positive().optional() }), req.query);
  const conds: SQL[] = [];
  if (q.status === "waiting") conds.push(sql`${schema.tickets.status} IN ('open','customer_reply')`);
  else if (q.status !== "all") conds.push(eq(schema.tickets.status, q.status));
  if (q.cursor) conds.push(lt(schema.tickets.id, q.cursor));
  const rows = await db
    .select({ t: schema.tickets, username: schema.users.username, email: schema.users.email })
    .from(schema.tickets)
    .innerJoin(schema.users, eq(schema.users.id, schema.tickets.userId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(q.status === "waiting" ? asc(schema.tickets.lastReplyAt) : desc(schema.tickets.lastReplyAt))
    .limit(51);
  const [{ waiting }] = (await db.select({ waiting: count() }).from(schema.tickets).where(sql`${schema.tickets.status} IN ('open','customer_reply')`)) as [{ waiting: number }];
  res.json({ items: rows.slice(0, 50).map((r) => ({ ...r.t, username: r.username, email: r.email })), nextCursor: rows.length > 50 ? rows[49]!.t.id : null, waiting });
});

adminTicketsRouter.get("/:id", async (req, res) => {
  const t = await loadThread(Number(req.params.id), null);
  const [u] = await db.select({ username: schema.users.username, email: schema.users.email, balance: schema.users.balance }).from(schema.users).where(eq(schema.users.id, t.userId)).limit(1);
  res.json({ ...t, customer: u });
});

adminTicketsRouter.post("/:id/reply", async (req, res) => {
  const id = Number(req.params.id);
  const { message, close } = parse(z.object({ message: z.string().trim().min(1, "Write a reply").max(5000), close: z.boolean().default(false) }), req.body);
  const t = await loadThread(id, null);
  await db.insert(schema.ticketMessages).values({ ticketId: id, userId: req.auth!.userId, isStaff: true, body: message });
  await db.update(schema.tickets).set({ status: close ? "closed" : "answered", lastReplyAt: new Date(), assignedTo: req.auth!.userId }).where(eq(schema.tickets.id, id));
  const u = await notify(db, { userId: t.userId, kind: "ticket", title: `Reply on "${t.subject}"`, body: message.slice(0, 200), href: `/dashboard/support/${id}` });
  if (u && wantsEmail(u.prefs, "tickets"))
    await enqueueEmail({
      to: u.email,
      subject: `Re: ${t.subject} [#${id}]`,
      title: "We replied to your ticket",
      lines: [`Hi ${u.username},`, message.length > 600 ? `${message.slice(0, 600)}…` : message],
      cta: { label: "View the conversation", path: `/dashboard/support/${id}` },
    });
  await audit(req, "ticket.reply", "ticket", id, { close });
  res.json({ ok: true });
});

adminTicketsRouter.post("/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const { status } = parse(z.object({ status: z.enum(["open", "closed"]) }), req.body);
  await db.update(schema.tickets).set({ status }).where(eq(schema.tickets.id, id));
  await audit(req, `ticket.${status}`, "ticket", id);
  res.json({ ok: true });
});

export const cannedRouter = Router();
cannedRouter.use(requirePerm("support"));
cannedRouter.get("/", async (_req, res) => {
  res.json(await db.select().from(schema.cannedReplies).orderBy(asc(schema.cannedReplies.title)));
});
cannedRouter.post("/", async (req, res) => {
  const input = parse(z.object({ title: z.string().trim().min(2).max(80), body: z.string().trim().min(2).max(5000) }), req.body);
  const [r] = await db.insert(schema.cannedReplies).values(input);
  res.status(201).json({ ok: true, id: Number(r.insertId) });
});
cannedRouter.delete("/:id", async (req, res) => {
  await db.delete(schema.cannedReplies).where(eq(schema.cannedReplies.id, Number(req.params.id)));
  res.json({ ok: true });
});

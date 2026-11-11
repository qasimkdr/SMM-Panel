import { Router } from "express";
import { z } from "zod";
import { parseMassOrder } from "@smm/shared";
import { requireUser } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { parse } from "../middleware/validate";
import { HttpError, notFound } from "../lib/errors";
import { listOrders, placeOrder, requestCancel, requestRefill } from "../services/orders";
import { openStream } from "../services/live";
import { getSetting } from "../lib/settings";

export const ordersRouter = Router();
ordersRouter.use(requireUser);

const perUser = (name: string, limit: number, windowSec: number) =>
  rateLimit({ name, limit, windowSec, key: (r) => String(r.auth!.userId) });

ordersRouter.get("/stream", (req, res) => openStream(req.auth!.userId, res));

ordersRouter.get("/", async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(["all", "pending", "processing", "in_progress", "completed", "partial", "canceled", "fail"]).optional(),
      q: z.string().trim().max(200).optional(),
      cursor: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
    req.query,
  );
  res.set("Cache-Control", "private, no-store");
  res.json(await listOrders(req.auth!.userId, q));
});

ordersRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { items } = await listOrders(req.auth!.userId, { q: String(id), limit: 1 });
  if (!items[0]) throw notFound("Order not found");
  res.json(items[0]);
});

ordersRouter.post("/", perUser("order", 60, 60), async (req, res) => {
  const result = await placeOrder(req.auth!.userId, req.body, { idempotencyKey: req.get("idempotency-key") });
  res.status(result.duplicate ? 200 : 201).json(result);
});

/** Mass order: "service_id | link | quantity" per line. Each line succeeds or fails on its own. */
ordersRouter.post("/mass", perUser("mass", 10, 60), async (req, res) => {
  if (!(await getSetting("orders.massOrderEnabled", true))) throw new HttpError(403, "disabled", "Mass orders are turned off");
  const { text } = parse(z.object({ text: z.string().min(1, "Add at least one line").max(200_000) }), req.body);
  const rows = parseMassOrder(text);
  if (rows.length > 500) throw new HttpError(400, "too_many", "Up to 500 lines per mass order");
  const results = [];
  for (const r of rows) {
    try {
      const placed = await placeOrder(req.auth!.userId, { service: r.service, link: r.link, quantity: r.quantity });
      results.push({ line: r.line, ok: true, order: placed.order, charge: placed.charge });
    } catch (e) {
      const err = e as HttpError;
      results.push({ line: r.line, ok: false, error: err.fields ? Object.values(err.fields)[0] : err.message });
    }
  }
  res.json({ results, placed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
});

ordersRouter.post("/:id/refill", perUser("refill", 20, 3600), async (req, res) => {
  res.json(await requestRefill(req.auth!.userId, Number(req.params.id)));
});

ordersRouter.post("/:id/cancel", perUser("cancel", 30, 3600), async (req, res) => {
  res.json(await requestCancel(req.auth!.userId, Number(req.params.id)));
});

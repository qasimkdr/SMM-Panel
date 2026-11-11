import { Router } from "express";
import { z } from "zod";
import { toMicros, fromMicros } from "@smm/shared";
import { parse } from "../../middleware/validate";
import { adjustBalance } from "../../services/ledger";
import { audit } from "../../services/audit";

export const adminUsersRouter = Router();

/** Manual top-up / deduction (the way funds are added while payments are "coming soon"). */
adminUsersRouter.post("/:id/balance", async (req, res) => {
  const input = parse(
    z.object({
      action: z.enum(["add", "deduct"]),
      amount: z.string().regex(/^\d+(\.\d{1,6})?$/, "Enter an amount like 10 or 10.50"),
      note: z.string().trim().max(255).optional(),
    }),
    req.body,
  );
  const userId = Number(req.params.id);
  const micros = toMicros(input.amount);
  const signed = fromMicros(input.action === "add" ? micros : -micros);
  const result = await adjustBalance({
    userId,
    amount: signed,
    type: input.action === "add" ? "admin_add" : "admin_deduct",
    note: input.note,
    actorId: req.auth!.userId,
  });
  await audit(req, `user.balance.${input.action}`, "user", userId, { amount: input.amount, note: input.note });
  res.json({ ok: true, ...result });
});

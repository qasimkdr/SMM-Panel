import { z } from "zod";

export const ticketCreateSchema = z.object({
  subject: z.string().trim().min(3, "Add a short subject").max(160),
  topic: z.enum(["order", "payment", "refill", "cancel", "api", "other"]),
  orderIds: z
    .string()
    .trim()
    .max(255)
    .regex(/^[\d,\s#]*$/, "Use order numbers separated by commas")
    .optional(),
  message: z.string().trim().min(5, "Tell us a bit more").max(5000),
});

export const ticketReplySchema = z.object({ message: z.string().trim().min(1, "Write a reply").max(5000) });

export const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, "Use at least 3 characters")
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only")
    .transform((s) => s.toUpperCase()),
  value: z.string().regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter an amount like 5 or 2.50"),
  maxUses: z.number().int().min(1).max(1_000_000).nullable(),
  perUserLimit: z.number().int().min(1).max(100).default(1),
  expiresAt: z.string().datetime().nullable().optional(),
  status: z.enum(["active", "disabled"]).default("active"),
});

export const redeemSchema = z.object({ code: z.string().trim().min(3, "Enter a code").max(32) });

export const payoutRequestSchema = z.object({
  amount: z.string().regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter an amount like 10 or 12.50"),
  method: z.enum(["balance", "external"]),
  details: z.string().trim().max(255).optional(),
});

export const childPanelSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .max(191)
    .regex(/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/, "Enter a domain like mypanel.com"),
  currency: z.string().regex(/^[A-Z]{3}$/),
  adminUsername: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers and underscores"),
});

export const twoFactorCodeSchema = z.object({ code: z.string().trim().min(6, "Enter the 6-digit code").max(12) });

export const emailPrefsSchema = z.object({ orders: z.boolean(), tickets: z.boolean(), news: z.boolean() });

export const TICKET_TOPICS = [
  { value: "order", label: "An order" },
  { value: "refill", label: "Refill" },
  { value: "cancel", label: "Cancel an order" },
  { value: "payment", label: "Balance or payment" },
  { value: "api", label: "API" },
  { value: "other", label: "Something else" },
] as const;

import { z } from "zod";
import { fromMicros, toMicros } from "./money";

/** Colored marks shown next to a payment method's name. */
export const PAYMENT_BRANDS = [
  { value: "jazzcash", label: "JazzCash" },
  { value: "easypaisa", label: "Easypaisa" },
  { value: "sadapay", label: "SadaPay" },
  { value: "nayapay", label: "NayaPay" },
  { value: "raast", label: "Raast" },
  { value: "binance", label: "Binance" },
  { value: "bank", label: "Bank transfer" },
  { value: "other", label: "Other" },
] as const;
export type PaymentBrand = (typeof PAYMENT_BRANDS)[number]["value"];

const amount2 = z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter an amount like 500 or 12.50");

export const paymentMethodInputSchema = z
  .object({
    name: z.string().trim().min(2, "Name the method").max(64),
    kind: z.enum(["manual", "binance_pay"]).default("manual"),
    brand: z.enum(PAYMENT_BRANDS.map((b) => b.value) as [PaymentBrand, ...PaymentBrand[]]).default("other"),
    currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code"),
    accountTitle: z.string().trim().max(120).nullable().optional(),
    accountNumber: z.string().trim().max(128).nullable().optional(),
    instructions: z.string().trim().max(2000).nullable().optional(),
    minAmount: amount2,
    maxAmount: amount2.nullable().optional(),
    /** Binance Pay: read-only API key and secret. Write-only; empty keeps the saved value. */
    apiKey: z.string().trim().max(128).optional(),
    apiSecret: z.string().trim().max(128).optional(),
    status: z.enum(["active", "disabled"]).default("active"),
    sort: z.coerce.number().int().min(0).max(999).default(0),
  })
  .refine((v) => !v.maxAmount || Number(v.maxAmount) >= Number(v.minAmount), { path: ["maxAmount"], message: "Max must be at least the min" });
export type PaymentMethodInput = z.infer<typeof paymentMethodInputSchema>;

/** Transaction IDs: letters, digits and - _ only (receipts never contain anything else). */
export const txnIdSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/\s+/g, ""))
  .pipe(z.string().min(4, "Enter the transaction ID from your receipt").max(64, "That ID looks too long").regex(/^[A-Za-z0-9_-]+$/, "Use only the letters and numbers from the receipt"));

export const depositInputSchema = z.object({
  methodId: z.coerce.number().int().positive("Pick a payment method"),
  amount: amount2,
  txnId: txnIdSchema,
  proofId: z.coerce.number().int().positive().optional(),
  note: z.string().trim().max(255).optional(),
});
export type DepositInput = z.infer<typeof depositInputSchema>;

/**
 * Converts an amount in `currency` to USD using a rate in "units per 1 USD" (the currencies table).
 * Exact decimal math; rounds down to the micro-dollar so we never credit more than was paid.
 */
export function localToUsd(amount: string, rate: string): string {
  const r = toMicros(rate); // 6 dp is plenty for rates like 278.512345
  if (r <= 0n) throw new Error("Invalid rate");
  return fromMicros((toMicros(amount) * 1_000_000n) / r);
}

/** WhatsApp chat link with a pre-filled message. */
export function whatsappLink(number: string, message?: string): string {
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

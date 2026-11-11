import { MICROS, divRound, fromMicros, toMicros } from "./money";

/**
 * Commission engine — the single source of truth for prices.
 * The admin types a plain number (e.g. 25) which means 25 %.
 * Priority: service override > category > provider > global default.
 */
export interface MarkupLevels {
  service?: string | number | null;
  category?: string | number | null;
  provider?: string | number | null;
  global: string | number;
}

const isSet = (v: unknown): v is string | number =>
  v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));

export function resolveMarkup(levels: MarkupLevels): { percent: string; source: keyof MarkupLevels } {
  for (const key of ["service", "category", "provider"] as const) {
    const v = levels[key];
    if (isSet(v)) return { percent: String(v), source: key };
  }
  return { percent: String(levels.global), source: "global" };
}

/** Percent string ("25" | "12.5") -> basis points scaled by 100 (2 dp precision). */
function percentToBp(percent: string | number): bigint {
  // 25.5% -> 2550 (hundredths of a percent)
  return divRound(toMicros(percent), 10_000n);
}

/** sell rate per 1000 = provider rate × (1 + markup / 100), rounded to 6 dp. */
export function applyMarkup(providerRate: string, markupPercent: string | number): string {
  const rate = toMicros(providerRate);
  const bp = percentToBp(markupPercent); // hundredths of %
  const sell = divRound(rate * (10_000n + bp), 10_000n);
  return fromMicros(sell < 0n ? 0n : sell);
}

/** Apply a discount % (VIP tier or per-user) to a sell rate. */
export function applyDiscount(sellRate: string, discountPercent: string | number | null | undefined): string {
  if (!isSet(discountPercent) || Number(discountPercent) <= 0) return sellRate;
  const rate = toMicros(sellRate);
  const bp = percentToBp(discountPercent);
  const out = divRound(rate * (10_000n - (bp > 10_000n ? 10_000n : bp)), 10_000n);
  return fromMicros(out);
}

/** Charge for an order: rate is per 1000 units. */
export function chargeFor(ratePer1000: string, quantity: number): string {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive integer");
  return fromMicros(divRound(toMicros(ratePer1000) * BigInt(quantity), 1000n));
}

/** Refund for a partial order: charge × remains / quantity. */
export function partialRefund(charge: string, quantity: number, remains: number): string {
  if (remains <= 0) return "0.000000";
  const r = Math.min(remains, quantity);
  return fromMicros(divRound(toMicros(charge) * BigInt(r), BigInt(quantity)));
}

/** Convert a USD amount into a display currency (rate = units per 1 USD). */
export function convert(usd: string, rate: string, decimals = 2): string {
  const v = divRound(toMicros(usd) * toMicros(rate), MICROS);
  return fromMicros(v, Math.min(6, Math.max(0, decimals)));
}

export function profitOf(charge: string, providerCost: string): string {
  return fromMicros(toMicros(charge) - toMicros(providerCost));
}

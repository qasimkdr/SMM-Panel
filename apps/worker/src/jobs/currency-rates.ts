import { eq, schema } from "@smm/db";
import { db, connection, logger } from "../lib";

/**
 * Daily exchange-rate refresh (free, keyless source). Only currencies with auto_rate = true are
 * updated; admins can switch a currency to a manual rate in the dashboard.
 */
export async function refreshCurrencyRates() {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`rates http ${res.status}`);
  const body = (await res.json()) as { result: string; rates: Record<string, number> };
  if (body.result !== "success") throw new Error("rates source returned an error");

  const rows = await db.select().from(schema.currencies).where(eq(schema.currencies.autoRate, true));
  let updated = 0;
  for (const c of rows) {
    const rate = c.code === "USD" ? 1 : body.rates[c.code];
    if (!rate || rate <= 0) continue;
    await db.update(schema.currencies).set({ rate: rate.toFixed(8) }).where(eq(schema.currencies.code, c.code));
    updated++;
  }
  await connection.del("currencies:enabled"); // API cache key
  logger.info({ updated }, "currency rates refreshed");
  return { updated };
}

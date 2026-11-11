/**
 * Money is stored in MySQL as DECIMAL(18,6) (USD) and handled in JS as integer
 * micro-units (1 USD = 1_000_000 micros) to avoid floating-point errors.
 */
export const MICROS = 1_000_000n;

/** "12.345678" | number -> bigint micros (rounded half-up at 6 dp). */
export function toMicros(value: string | number | bigint): bigint {
  if (typeof value === "bigint") return value * MICROS;
  const str = typeof value === "number" ? value.toFixed(8) : value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) throw new Error(`Invalid money value: ${value}`);
  const negative = str.startsWith("-");
  const [intPart, fracRaw = ""] = str.replace("-", "").split(".");
  const frac = (fracRaw + "0000000").slice(0, 7); // one extra digit for rounding
  let micros = BigInt(intPart!) * MICROS + BigInt(frac.slice(0, 6));
  if (Number(frac[6]) >= 5) micros += 1n;
  return negative ? -micros : micros;
}

/** bigint micros -> "12.345678" (DECIMAL-safe string). */
export function fromMicros(micros: bigint, scale = 6): string {
  const negative = micros < 0n;
  const abs = negative ? -micros : micros;
  const intPart = abs / MICROS;
  const frac = (abs % MICROS).toString().padStart(6, "0").slice(0, scale);
  return `${negative ? "-" : ""}${intPart}${scale > 0 ? "." + frac : ""}`;
}

/** Divide with half-up rounding. */
export function divRound(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new Error("Division by zero");
  const q = a / b;
  const r = a % b;
  return r * 2n >= b ? q + 1n : q;
}

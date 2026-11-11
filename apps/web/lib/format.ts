export interface Currency {
  code: string;
  symbol: string;
  rate: string;
  decimals: number;
  name: string;
}

/** Display-only conversion of a USD string (the backend is the source of truth for charges). */
export function formatMoney(usd: string | number, currency?: Currency | null, opts: { rate?: boolean } = {}) {
  const value = Number(usd) * Number(currency?.rate ?? 1);
  const decimals = opts.rate ? Math.max(currency?.decimals ?? 2, value < 1 ? 4 : 2) : (currency?.decimals ?? 2);
  const num = value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const sym = currency?.symbol ?? "$";
  return sym.length > 1 ? `${sym} ${num}` : `${sym}${num}`;
}

export function formatDuration(sec: number | null | undefined) {
  if (!sec) return "—";
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))} min`;
  if (sec < 86400) return `${Math.round(sec / 3600)} h`;
  return `${Math.round(sec / 86400)} d`;
}

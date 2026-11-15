import { cn } from "@/lib/cn";

/**
 * A colored monogram for a payment method. Deliberately not the companies' logos (trademarks):
 * the hue and initials are enough to recognise a wallet at a glance. Decorative: the name is always shown next to it.
 */
const BRANDS: Record<string, { bg: string; fg: string; label: string }> = {
  jazzcash: { bg: "#b3141c", fg: "#fff", label: "JC" },
  easypaisa: { bg: "#1d7a34", fg: "#fff", label: "EP" },
  sadapay: { bg: "#b4235a", fg: "#fff", label: "SP" },
  nayapay: { bg: "#c2410c", fg: "#fff", label: "NP" },
  raast: { bg: "#4c3a8f", fg: "#fff", label: "R" },
  binance: { bg: "#f0b90b", fg: "#1e2026", label: "B" },
  bank: { bg: "#44403c", fg: "#fff", label: "BK" },
  other: { bg: "#57534e", fg: "#fff", label: "" },
};

export function BrandMark({ brand, name, className }: { brand: string; name: string; className?: string }) {
  const b = BRANDS[brand] ?? BRANDS.other!;
  const label = b.label || name.slice(0, 2).toUpperCase();
  return (
    <span
      aria-hidden
      className={cn("grid size-10 shrink-0 place-items-center rounded-xl font-mono text-[13px] font-semibold tracking-tight shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_1px_2px_rgb(0_0_0/0.18)]", className)}
      style={{ background: b.bg, color: b.fg }}
    >
      {label}
    </span>
  );
}

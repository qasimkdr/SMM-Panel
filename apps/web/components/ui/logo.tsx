import { cn } from "@/lib/cn";

/** Custom mark: two offset rounded planes (depth) with an ember core. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect x="3" y="7" width="20" height="20" rx="6" className="fill-ink/15" />
      <rect x="9" y="3" width="20" height="20" rx="6" className="fill-ink" />
      <circle cx="19" cy="13" r="4" className="fill-accent" />
    </svg>
  );
}

export function Logo({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight text-ink", className)}>
      <LogoMark />
      <span className="text-[17px]">{name}</span>
    </span>
  );
}

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  // Physical "key" feel: a 1px bottom edge that collapses on press.
  primary:
    "bg-accent text-accent-ink shadow-[0_1px_0_rgb(0_0_0/0.15),inset_0_1px_0_rgb(255_255_255/0.18)] hover:bg-accent-hover active:shadow-press",
  secondary:
    "bg-surface text-ink border border-line-strong shadow-1 hover:border-ink-3/40 hover:bg-surface-2 active:shadow-press",
  ghost: "text-ink-2 hover:text-ink hover:bg-bg-subtle",
  danger: "bg-danger text-white hover:opacity-90 active:shadow-press",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[9px]",
  md: "h-10 px-4 text-sm gap-2 rounded-[11px]",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-[13px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const buttonClass = (variant: Variant = "primary", size: Size = "md", className?: string) =>
  cn(
    "inline-flex select-none items-center justify-center font-medium whitespace-nowrap",
    "transition-[transform,background-color,border-color,box-shadow,color] duration-200 ease-[var(--ease-out-soft)]",
    "hover:-translate-y-px active:translate-y-px active:scale-[0.985]",
    "disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

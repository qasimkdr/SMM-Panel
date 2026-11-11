import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, error, hint, className, id, children, ...rest }, ref) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <div className={cn("grid gap-1.5", className)}>
      {label && (
        <label htmlFor={sid} className="text-[13px] font-medium text-ink-2">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={sid}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${sid}-err` : hint ? `${sid}-hint` : undefined}
          className={cn(
            "h-10 w-full appearance-none rounded-[10px] border bg-surface pl-3 pr-9 text-[14px] text-ink transition-[border-color,box-shadow]",
            "hover:border-line-strong focus:border-accent focus:shadow-[var(--ring)] focus:outline-none",
            error ? "border-danger" : "border-line",
          )}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      </div>
      {error ? (
        <p id={`${sid}-err`} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${sid}-hint`} className="text-[13px] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

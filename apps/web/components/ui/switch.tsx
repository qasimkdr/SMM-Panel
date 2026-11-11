"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  hideLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-start justify-between gap-4", hideLabel && "inline-flex")}>
      {!hideLabel && (
        <label htmlFor={id} className="grid gap-0.5">
          <span className="text-[14px] font-medium text-ink">{label}</span>
          {description && <span className="text-[13px] text-ink-3">{description}</span>}
        </label>
      )}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={hideLabel ? label : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full border transition-colors duration-200 disabled:opacity-50",
          checked ? "border-accent bg-accent" : "border-line-strong bg-bg-subtle",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-[18px] rounded-full bg-white shadow-1 transition-transform duration-200 ease-[var(--ease-spring)]",
            checked && "translate-x-4",
          )}
        />
      </button>
    </div>
  );
}

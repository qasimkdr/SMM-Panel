"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** "modal" = centered card, "sheet" = slides in from the right (edit panels). */
  variant?: "modal" | "sheet";
  size?: "sm" | "md" | "lg";
}

/**
 * Accessible dialog: role=dialog + aria-modal, Esc to close, focus moves in and is trapped,
 * focus returns to the trigger on close, page scroll locked while open.
 */
export function Dialog({ open, onClose, title, description, children, footer, variant = "modal", size = "md" }: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  // Keep the latest onClose without re-running the open/close effect (which would lose the trigger to refocus).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Record the trigger during render: children with autoFocus grab focus before effects run.
  const trigger = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== "undefined") trigger.current = document.activeElement as HTMLElement | null;
  wasOpen.current = open;

  useEffect(() => {
    if (!open) return;
    const previous = trigger.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>("[autofocus], input, select, textarea, button:not([data-close])");
      (first ?? panel.current)?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab" && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')];
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (typeof document === "undefined") return null;
  const sheet = variant === "sheet";
  const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn("fixed inset-0 z-[70] flex", sheet ? "justify-end" : "items-end justify-center p-0 sm:items-center sm:p-4")}>
          <motion.div
            className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            initial={reduce ? { opacity: 0 } : sheet ? { x: "100%" } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={reduce ? { opacity: 1 } : sheet ? { x: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : sheet ? { x: "100%" } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={sheet ? { type: "spring", stiffness: 380, damping: 40 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "relative flex max-h-[100dvh] w-full flex-col border-line bg-surface shadow-3 outline-none",
              sheet ? "h-dvh max-w-xl border-l" : cn("max-h-[90dvh] rounded-t-[var(--radius-xl)] border sm:rounded-[var(--radius-xl)]", widths[size]),
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <h2 id={titleId} className="text-[17px] font-semibold tracking-tight">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="mt-1 text-[14px] text-ink-3">
                    {description}
                  </p>
                )}
              </div>
              <button
                data-close
                onClick={onClose}
                aria-label="Close"
                className="-mr-2 grid size-9 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-bg-subtle hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-line bg-surface-2 px-6 py-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

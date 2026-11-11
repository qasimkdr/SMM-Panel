"use client";

import { useCallback, useRef, type HTMLAttributes, type PointerEvent } from "react";
import { cn } from "@/lib/cn";

interface TiltCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Max rotation in degrees. Keep it subtle: 4–8 reads as "premium", 15+ reads as a gimmick. */
  max?: number;
  glare?: boolean;
  /** Render as an interactive surface (press-in on active). */
  pressable?: boolean;
}

/**
 * 3D tilt surface. Pointer position → CSS variables via requestAnimationFrame;
 * the browser composites transform/opacity only, so it stays at 60fps on mid-range phones.
 * Touch devices and reduced-motion users get a static card.
 */
export function TiltCard({ max = 6, glare = true, pressable = false, className, children, ...rest }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const onMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "mouse") return;
      const el = ref.current;
      if (!el) return;
      const { left, top, width, height } = el.getBoundingClientRect();
      const x = (e.clientX - left) / width;
      const y = (e.clientY - top) / height;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        el.style.setProperty("--ry", `${(x - 0.5) * 2 * max}deg`);
        el.style.setProperty("--rx", `${(0.5 - y) * 2 * max}deg`);
        el.style.setProperty("--mx", `${x * 100}%`);
        el.style.setProperty("--my", `${y * 100}%`);
        el.dataset.active = "true";
      });
    },
    [max],
  );

  const reset = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.dataset.active = "false";
    el.dataset.pressed = "false";
  }, []);

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      onPointerDown={pressable ? () => ref.current && (ref.current.dataset.pressed = "true") : undefined}
      onPointerUp={pressable ? () => ref.current && (ref.current.dataset.pressed = "false") : undefined}
      className={cn(
        "tilt relative rounded-[var(--radius-lg)] border border-line bg-surface shadow-2",
        className,
      )}
      {...rest}
    >
      {children}
      {glare && <span aria-hidden className="tilt-glare" />}
    </div>
  );
}

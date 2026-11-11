"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Camera, Check, Music2, Play, RotateCcw } from "lucide-react";

/**
 * Hero visual: a small "live order" scene built from real UI pieces in CSS 3D.
 * The whole stage follows the pointer (rAF → CSS vars), layers sit at different Z depths.
 * No WebGL, no images — ~0 KB of assets, renders instantly, crisp at any DPI.
 */
export function HeroScene() {
  const stage = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const el = stage.current;
    if (!el || !matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--sx", `${16 - y * 10}deg`);
        el.style.setProperty("--sy", `${-24 + x * 14}deg`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduce]);

  const enter = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <div aria-hidden className="relative mx-auto aspect-[5/4] w-full max-w-[540px] [perspective:1400px]">
      <div
        ref={stage}
        className="absolute inset-0 transition-transform duration-[900ms] ease-[var(--ease-out-soft)] [transform-style:preserve-3d]"
        style={{ transform: "rotateX(var(--sx, 16deg)) rotateY(var(--sy, -24deg))" }}
      >
        {/* back plane: services list */}
        <motion.div {...enter(0.1)} className="absolute left-[2%] top-[4%] w-[62%] [transform:translateZ(-60px)]">
          <div className="rounded-[18px] border border-line bg-surface-2 p-4 shadow-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">Services</p>
            {[
              { icon: Camera, name: "Followers · Refill 30d", price: "$1.20" },
              { icon: Play, name: "Views · Fast start", price: "$0.42" },
              { icon: Music2, name: "Likes · Real profiles", price: "$0.88" },
            ].map((s) => (
              <div key={s.name} className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
                <s.icon className="size-4 text-ink-3" />
                <span className="flex-1 truncate text-[13px] text-ink-2">{s.name}</span>
                <span className="font-mono text-[12px] text-ink">{s.price}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* main plane: the order */}
        <motion.div {...enter(0.25)} className="absolute left-[18%] top-[30%] w-[72%] [transform:translateZ(40px)]">
          <div className="rounded-[20px] border border-line bg-surface p-5 shadow-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent">
                  <Camera className="size-4" />
                </span>
                <div>
                  <p className="text-[13px] font-medium">Order #48213</p>
                  <p className="font-mono text-[11px] text-ink-3">instagram.com/yourbrand</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-info-soft px-2.5 py-1 text-[11px] font-medium text-info">
                <span className="size-1.5 animate-pulse rounded-full bg-info" />
                In progress
              </span>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-bg-subtle">
              <div className="h-full origin-left animate-fill rounded-full bg-accent" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-[11px]">
              {[
                ["Start count", "12,480"],
                ["Ordered", "2,500"],
                ["Remains", "640"],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-ink-3">{k}</p>
                  <p className="mt-0.5 font-mono text-[13px] text-ink">{v}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* front chips */}
        <motion.div {...enter(0.45)} className="absolute right-[2%] top-[12%] [transform:translateZ(110px)]">
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-3.5 shadow-3">
            <span className="grid size-6 place-items-center rounded-full bg-success text-white">
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            <span className="text-[12px] font-medium">Completed</span>
            <span className="font-mono text-[12px] text-ink-3">+2,500</span>
          </div>
        </motion.div>
        <motion.div {...enter(0.6)} className="absolute bottom-[6%] left-[8%] [transform:translateZ(90px)]">
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 py-2.5 shadow-3">
            <RotateCcw className="size-4 text-accent" />
            <div>
              <p className="text-[12px] font-medium">Refill requested</p>
              <p className="text-[11px] text-ink-3">Covered for 30 days</p>
            </div>
          </div>
        </motion.div>
      </div>
      {/* soft floor shadow anchors the scene */}
      <div className="absolute inset-x-[12%] bottom-0 h-10 rounded-[50%] bg-ink/10 blur-2xl dark:bg-black/50" />
    </div>
  );
}

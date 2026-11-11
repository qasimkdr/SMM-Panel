"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

interface Notification {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

const ago = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

/** Bell with unread count; list opens as a popover. Order events refresh it (see useOrderStream). */
export function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ items: Notification[]; unread: number }>("/notifications"),
    refetchInterval: 90_000,
    staleTime: 30_000,
  });
  const readAll = useMutation({
    mutationFn: (id?: number) => api("/notifications/read", { method: "POST", json: id ? { id } : {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = data?.unread ?? 0;
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative grid size-10 place-items-center rounded-full border border-line bg-surface text-ink-2 shadow-1 transition-transform duration-200 hover:-translate-y-px hover:text-ink"
      >
        <Bell className="size-[18px]" aria-hidden />
        {unread > 0 && (
          <span className="tabular absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-ink">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-32px))] origin-top-right overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-3"
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-[14px] font-semibold">Notifications</p>
              {unread > 0 && (
                <button onClick={() => readAll.mutate(undefined)} className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
                  <CheckCheck className="size-3.5" aria-hidden /> Mark all read
                </button>
              )}
            </div>
            {data?.items.length ? (
              <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
                {data.items.map((n) => {
                  const inner = (
                    <>
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-[14px]", n.readAt ? "text-ink-2" : "font-medium text-ink")}>{n.title}</span>
                        {n.body && <span className="mt-0.5 block text-[13px] text-ink-3">{n.body}</span>}
                        <span className="mt-1 block text-[12px] text-ink-3">{ago(n.createdAt)}</span>
                      </span>
                    </>
                  );
                  const cls = "flex gap-3 px-4 py-3 transition-colors hover:bg-bg-subtle/60";
                  return (
                    <li key={n.id}>
                      {n.href ? (
                        <Link
                          href={n.href}
                          className={cls}
                          onClick={() => {
                            if (!n.readAt) readAll.mutate(n.id);
                            setOpen(false);
                          }}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div className={cls}>{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-10 text-center text-[14px] text-ink-3">You&apos;re all caught up.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

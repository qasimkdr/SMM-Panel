"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Megaphone, Wrench, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface Notice {
  id: number;
  title: string;
  body: string;
  kind: "banner" | "popup" | "news";
}

const KEY = "dismissed-notices";
const readDismissed = (): number[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
};
const dismiss = (id: number) => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set([...readDismissed(), id])].slice(-50)));
  } catch {}
};

/** Customer-facing banners, one-time pop-ups and the maintenance notice. */
export function DashboardNotices() {
  const notices = useQuery({ queryKey: ["announcements"], queryFn: () => api<Notice[]>("/announcements"), staleTime: 5 * 60_000 });
  const settings = useQuery({ queryKey: ["public-settings"], queryFn: () => api<Record<string, unknown>>("/settings"), staleTime: 60_000 });
  const [dismissed, setDismissed] = useState<number[]>([]);
  useEffect(() => setDismissed(readDismissed()), []);

  const banners = (notices.data ?? []).filter((n) => n.kind === "banner" && !dismissed.includes(n.id));
  const popup = (notices.data ?? []).find((n) => n.kind === "popup" && !dismissed.includes(n.id));
  const close = (id: number) => {
    dismiss(id);
    setDismissed(readDismissed());
  };

  return (
    <>
      {settings.data?.["site.maintenance"] === true && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-warning-soft px-4 py-3 text-[14px] text-warning" role="status">
          <Wrench className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>We&apos;re doing maintenance. New orders are paused for a few minutes; existing orders keep running.</span>
        </div>
      )}
      <AnimatePresence initial={false}>
        {banners.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="mb-4 flex items-start gap-3 overflow-hidden rounded-xl border border-accent-line bg-accent-soft px-4 py-3"
          >
            <Megaphone className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0 flex-1 text-[14px]">
              <p className="font-medium text-ink">{n.title}</p>
              <p className="text-ink-2">{n.body}</p>
            </div>
            <button onClick={() => close(n.id)} aria-label={`Dismiss ${n.title}`} className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-surface hover:text-ink">
              <X className="size-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
      {popup && (
        <Dialog
          open
          onClose={() => close(popup.id)}
          size="sm"
          title={popup.title}
          footer={
            <Button onClick={() => close(popup.id)} autoFocus>
              Got it
            </Button>
          }
        >
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{popup.body}</p>
        </Dialog>
      )}
    </>
  );
}

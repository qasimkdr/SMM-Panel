"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ExternalLink, ListOrdered, RotateCcw, Search, XCircle } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Skeleton } from "@/components/dashboard/page-header";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useCurrency } from "@/lib/hooks/queries";
import { useOrders, type OrderRow } from "@/lib/hooks/orders";
import { cn } from "@/lib/cn";
import { ORDER_TABS, StatusBadge } from "./status-badge";

function Progress({ o }: { o: OrderRow }) {
  const total = o.quantity * (o.runs ?? 1);
  const delivered = o.status === "completed" ? total : Math.max(0, total - (o.remains ?? total));
  const pct = total ? Math.min(1, delivered / total) : 0;
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg-subtle" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={delivered} aria-label={`Order ${o.id} progress`}>
        <motion.div
          className={cn("h-full origin-left rounded-full", o.status === "canceled" ? "bg-danger/50" : o.status === "partial" ? "bg-warning" : o.status === "completed" ? "bg-success" : "bg-accent")}
          initial={false}
          animate={{ scaleX: pct }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <p className="tabular mt-1.5 text-[12.5px] text-ink-3">
        {delivered.toLocaleString()} / {total.toLocaleString()}
        {o.startCount !== null && <span> · start {o.startCount.toLocaleString()}</span>}
        {o.runs && <span> · {o.runs} runs every {o.intervalMin} min</span>}
      </p>
    </div>
  );
}

function OrderItem({ o, compact }: { o: OrderRow; compact?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const currency = useCurrency();
  const refresh = () => qc.invalidateQueries({ queryKey: ["orders"] });
  const refill = useMutation({
    mutationFn: () => api(`/orders/${o.id}/refill`, { method: "POST" }),
    onSuccess: () => toast(`Refill requested for order #${o.id}`),
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't request a refill", "danger"),
  });
  const cancel = useMutation({
    mutationFn: () => api<{ canceled: boolean }>(`/orders/${o.id}/cancel`, { method: "POST" }),
    onSuccess: (r) => {
      toast(r.canceled ? `Order #${o.id} canceled and refunded` : `Cancel requested. We'll refund automatically once the provider confirms.`);
      refresh();
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't cancel", "danger"),
  });

  const refillOpen =
    o.refill && (o.status === "completed" || o.status === "partial") && (!o.refillDays || !o.completedAt || Date.now() - new Date(o.completedAt).getTime() < o.refillDays * 86_400_000);
  const cancelOpen = o.cancel && ["pending", "processing", "in_progress"].includes(o.status);
  const refunded = Number(o.refunded) > 0;

  return (
    <li className="grid gap-3 px-4 py-4 transition-colors hover:bg-bg-subtle/50 sm:px-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center md:gap-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12.5px] text-ink-3">#{o.id}</span>
          <StatusBadge status={o.status} />
        </div>
        <p className="mt-1 truncate text-[14px] font-medium">{o.serviceName ?? "Service removed"}</p>
        <a href={o.link.startsWith("http") ? o.link : undefined} target="_blank" rel="noopener noreferrer nofollow" className="mt-0.5 flex max-w-full items-center gap-1 truncate text-[13px] text-ink-3 hover:text-ink">
          <span className="truncate">{o.link}</span>
          {o.link.startsWith("http") && <ExternalLink className="size-3 shrink-0" aria-hidden />}
        </a>
      </div>
      {!compact && <Progress o={o} />}
      <div className="flex items-center justify-between gap-3 md:justify-end">
        <div className="text-left md:text-right">
          <p className="tabular text-[14px] font-semibold">{formatMoney(o.charge, currency)}</p>
          <p className="text-[12px] text-ink-3">
            {refunded ? <span className="text-success">{formatMoney(o.refunded, currency)} refunded</span> : new Date(o.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        {!compact && (refillOpen || cancelOpen) && (
          <div className="flex gap-1.5">
            {refillOpen && (
              <Button variant="secondary" size="sm" loading={refill.isPending} onClick={() => refill.mutate()}>
                {!refill.isPending && <RotateCcw className="size-3.5" aria-hidden />} Refill
              </Button>
            )}
            {cancelOpen && (
              <Button variant="ghost" size="sm" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                {!cancel.isPending && <XCircle className="size-3.5" aria-hidden />} Cancel
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function OrdersList({ compact = false, limit = 30 }: { compact?: boolean; limit?: number }) {
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim());
  const list = useOrders(status, q, limit);
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      {!compact && (
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Order status">
            {ORDER_TABS.map((t) => (
              <button
                key={t.value}
                role="tab"
                aria-selected={status === t.value}
                onClick={() => setStatus(t.value)}
                className={cn(
                  "h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-[background-color,color] duration-200",
                  status === t.value ? "bg-ink text-bg" : "text-ink-2 hover:bg-bg-subtle",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="relative md:w-72">
            <span className="sr-only">Search orders</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Order ID or link"
              className="h-10 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-[14px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
            />
          </label>
        </div>
      )}

      <div className={compact ? "-mx-5" : "overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1"}>
        {list.isLoading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="grid place-items-center px-6 py-14 text-center">
            <ListOrdered className="size-6 text-ink-3" aria-hidden />
            <p className="mt-3 font-medium">{status === "all" && !q ? "No orders yet" : "No orders match"}</p>
            <p className="mt-1 max-w-sm text-sm text-ink-3">
              {status === "all" && !q ? "When you place an order it shows up here and updates by itself." : "Try another status or search."}
            </p>
            {status === "all" && !q && (
              <Link href="/dashboard/new-order" className={buttonClass("primary", "sm", "mt-4")}>
                New order
              </Link>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((o) => (
              <OrderItem key={o.id} o={o} compact={compact} />
            ))}
          </ul>
        )}
        {!compact && list.hasNextPage && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="secondary" size="sm" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

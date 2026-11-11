"use client";

import { useDeferredValue, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, ListOrdered, MoreHorizontal, Search, Webhook } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { StatusBadge, ORDER_TABS } from "@/components/orders/status-badge";
import { api, ApiError } from "@/lib/api";
import type { OrderRow } from "@/lib/hooks/orders";
import { cn } from "@/lib/cn";

interface AdminOrder extends OrderRow {
  userId: number;
  username: string;
  providerOrderId: string | null;
  providerName: string | null;
  providerCost: string | null;
  profit: string | null;
  error: string | null;
  viaApi: boolean;
  extra: Record<string, unknown> | null;
}
type Action = "in_progress" | "complete" | "partial" | "cancel" | "start_count" | "resend";
const usd = (v: string | null) => (v === null ? "—" : `$${Number(v).toFixed(Number(v) < 1 ? 4 : 2)}`);

function RowMenu({ o, onPick }: { o: AdminOrder; onPick: (a: Action) => void }) {
  const [open, setOpen] = useState(false);
  const active = ["pending", "processing", "in_progress", "fail"].includes(o.status);
  const items: { a: Action; label: string; show: boolean; danger?: boolean }[] = [
    { a: "in_progress", label: "Mark in progress", show: o.mode === "manual" && o.status === "pending" },
    { a: "complete", label: "Mark completed", show: active },
    { a: "partial", label: "Mark partial…", show: active },
    { a: "start_count", label: "Set start count…", show: true },
    { a: "resend", label: "Resend to provider", show: o.mode === "auto" && !o.providerOrderId && (o.status === "pending" || o.status === "fail") },
    { a: "cancel", label: "Cancel and refund", show: active, danger: true },
  ];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label={`Actions for order ${o.id}`}
        aria-expanded={open}
        className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-bg-subtle hover:text-ink"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 text-left shadow-3">
          {items
            .filter((i) => i.show)
            .map((i) => (
              <button
                key={i.a}
                role="menuitem"
                onClick={() => onPick(i.a)}
                className={cn("block w-full px-3 py-2 text-left text-[14px]", i.danger ? "text-danger hover:bg-danger-soft" : "hover:bg-bg-subtle")}
              >
                {i.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export function OrdersAdmin() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState("all");
  const [mode, setMode] = useState("");
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim());
  const [pending, setPending] = useState<{ o: AdminOrder; a: Action } | null>(null);
  const [num, setNum] = useState("");

  const params = new URLSearchParams(Object.entries({ status, mode, q }).filter(([, v]) => v) as [string, string][]);
  const list = useInfiniteQuery({
    queryKey: ["admin", "orders", params.toString()],
    queryFn: ({ pageParam }) => api<{ items: AdminOrder[]; nextCursor: number | null }>(`/admin/orders?${params}${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: 0,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
    refetchInterval: 30_000,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  const act = useMutation({
    mutationFn: ({ o, a, value }: { o: AdminOrder; a: Action; value?: number }) =>
      api<{ refunded: string }>(`/admin/orders/${o.id}/action`, {
        method: "POST",
        json: a === "partial" ? { action: a, remains: value } : a === "start_count" ? { action: a, startCount: value } : { action: a },
      }),
    onSuccess: (r, v) => {
      toast(`Order #${v.o.id} updated${Number(r.refunded) > 0 ? `, $${Number(r.refunded).toFixed(2)} refunded` : ""}`);
      setPending(null);
      setNum("");
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
    onError: (e) => toast(e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0]! : e.message) : "Action failed", "danger"),
  });

  function pick(o: AdminOrder, a: Action) {
    if (a === "partial" || a === "start_count" || a === "cancel") setPending({ o, a });
    else act.mutate({ o, a });
  }

  return (
    <>
      <PageHeader title="Orders" description="All customer orders. Manual services wait here for your team; provider orders update automatically." />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Order status">
          {[...ORDER_TABS, { value: "fail", label: "Needs attention" }].map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={status === t.value}
              onClick={() => setStatus(t.value)}
              className={cn("h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors", status === t.value ? "bg-ink text-bg" : "text-ink-2 hover:bg-bg-subtle")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMode((m) => (m === "manual" ? "" : "manual"))}
            aria-pressed={mode === "manual"}
            className={cn("h-10 shrink-0 rounded-[10px] border px-3 text-[13px] font-medium transition-colors", mode === "manual" ? "border-accent bg-accent-soft text-accent-text" : "border-line bg-surface text-ink-2 hover:border-line-strong")}
          >
            Manual queue
          </button>
          <label className="relative w-full lg:w-64">
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
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-[14px]">
            <thead className="border-b border-line bg-surface-2 text-[12px] text-ink-3">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-2 py-3 font-medium">Customer</th>
                <th className="px-2 py-3 font-medium">Service / link</th>
                <th className="px-2 py-3 text-right font-medium">Qty / remains</th>
                <th className="px-2 py-3 text-right font-medium">Charge</th>
                <th className="px-2 py-3 text-right font-medium">Profit</th>
                <th className="px-2 py-3 font-medium">Provider</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading &&
                [0, 1, 2].map((i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-4 py-3">
                      <Skeleton className="h-9" />
                    </td>
                  </tr>
                ))}
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-line align-top transition-colors last:border-0 hover:bg-bg-subtle/60">
                  <td className="px-4 py-3">
                    <p className="font-mono text-[12.5px] text-ink-3">#{o.id}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <StatusBadge status={o.status} />
                      {o.mode === "manual" && <Badge tone="accent">Manual</Badge>}
                      {o.viaApi && (
                        <Badge>
                          <Webhook className="size-3" aria-hidden /> API
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-[13px]">{o.username}</td>
                  <td className="max-w-[300px] px-2 py-3">
                    <p className="truncate font-medium">{o.serviceName}</p>
                    <a href={o.link.startsWith("http") ? o.link : undefined} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 truncate text-[12.5px] text-ink-3 hover:text-ink">
                      <span className="truncate">{o.link}</span>
                      <ExternalLink className="size-3 shrink-0" aria-hidden />
                    </a>
                    {o.extra && Object.keys(o.extra).length > 0 && (
                      <details className="mt-1 text-[12px] text-ink-3">
                        <summary className="cursor-pointer">Order details</summary>
                        <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-bg-subtle p-2 font-mono">{Object.entries(o.extra).map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>
                      </details>
                    )}
                    {o.error && (
                      <p className="mt-1 flex items-start gap-1 text-[12px] text-danger">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden /> {o.error}
                      </p>
                    )}
                  </td>
                  <td className="tabular px-2 py-3 text-right font-mono text-[13px]">
                    {(o.quantity * (o.runs ?? 1)).toLocaleString()}
                    <span className="block text-ink-3">{o.remains?.toLocaleString() ?? "—"} left</span>
                  </td>
                  <td className="tabular px-2 py-3 text-right font-mono text-[13px]">
                    {usd(o.charge)}
                    {Number(o.refunded) > 0 && <span className="block text-success">−{usd(o.refunded)}</span>}
                  </td>
                  <td className={cn("tabular px-2 py-3 text-right font-mono text-[13px]", Number(o.profit) < 0 ? "text-danger" : "text-success")}>{usd(o.profit)}</td>
                  <td className="px-2 py-3 text-[13px]">
                    {o.providerName ?? (o.mode === "manual" ? "Your team" : "—")}
                    {o.providerOrderId && <span className="block font-mono text-[12px] text-ink-3">#{o.providerOrderId}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RowMenu o={o} onPick={(a) => pick(o, a)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.isLoading && rows.length === 0 && (
          <div className="grid place-items-center px-6 py-14 text-center">
            <ListOrdered className="size-6 text-ink-3" aria-hidden />
            <p className="mt-3 font-medium">No orders here</p>
            <p className="mt-1 text-sm text-ink-3">{mode === "manual" ? "Nothing waiting for your team." : "Try another status or search."}</p>
          </div>
        )}
        {list.hasNextPage && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="secondary" size="sm" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        size="sm"
        title={pending?.a === "cancel" ? `Cancel order #${pending.o.id}?` : pending?.a === "partial" ? `Mark #${pending?.o.id} partial` : `Start count for #${pending?.o.id}`}
        description={
          pending?.a === "cancel"
            ? `The customer gets back what hasn't been refunded yet (${usd((Number(pending.o.charge) - Number(pending.o.refunded)).toFixed(6))}).`
            : pending?.a === "partial"
              ? "Enter how many were NOT delivered. The customer is refunded for that share automatically."
              : "The count before delivery started, shown to the customer."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              {pending?.a === "cancel" ? "Keep order" : "Cancel"}
            </Button>
            <Button
              variant={pending?.a === "cancel" ? "danger" : "primary"}
              loading={act.isPending}
              onClick={() => pending && act.mutate({ o: pending.o, a: pending.a, value: Number(num) })}
            >
              {pending?.a === "cancel" ? "Cancel and refund" : "Save"}
            </Button>
          </>
        }
      >
        {pending?.a !== "cancel" && (
          <Field
            label={pending?.a === "partial" ? "Not delivered" : "Start count"}
            inputMode="numeric"
            autoFocus
            value={num}
            onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))}
            hint={pending?.a === "partial" ? `Ordered: ${((pending?.o.quantity ?? 0) * (pending?.o.runs ?? 1)).toLocaleString()}` : undefined}
          />
        )}
        {pending?.a === "cancel" && <p className="text-[14px] text-ink-2">If it's at a provider, we'll also ask them to stop.</p>}
      </Dialog>
    </>
  );
}

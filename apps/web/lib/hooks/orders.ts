"use client";

import { useEffect } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { OrderEvent } from "@smm/shared";
import { api } from "@/lib/api";

export interface OrderRow {
  id: number;
  serviceId: number;
  serviceName: string | null;
  link: string;
  quantity: number;
  runs: number | null;
  intervalMin: number | null;
  charge: string;
  refunded: string;
  startCount: number | null;
  remains: number | null;
  status: "pending" | "processing" | "in_progress" | "completed" | "partial" | "canceled" | "fail";
  mode: "auto" | "manual";
  createdAt: string;
  completedAt: string | null;
  refill: boolean | null;
  refillDays: number | null;
  cancel: boolean | null;
}
type Page = { items: OrderRow[]; nextCursor: number | null };

export function useOrders(status: string, q: string, limit = 30, base = "/orders", key: unknown[] = ["orders"]) {
  return useInfiniteQuery({
    queryKey: [...key, status, q, limit],
    queryFn: ({ pageParam }) =>
      api<Page>(`${base}?${new URLSearchParams({ status, q, limit: String(limit), ...(pageParam ? { cursor: String(pageParam) } : {}) })}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000, // live events keep it fresh; no polling
  });
}

/**
 * One EventSource per tab. Each event patches the cached order lists in place (no refetch),
 * and refreshes the balance when money moved.
 */
export function useOrderStream() {
  const qc = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource("/api/orders/stream", { withCredentials: true });
    es.addEventListener("order", (ev) => {
      const e = JSON.parse((ev as MessageEvent).data) as OrderEvent;
      let found = false;
      qc.setQueriesData<InfiniteData<Page>>({ queryKey: ["orders"] }, (data) => {
        if (!data) return data;
        return {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            items: p.items.map((o) => {
              if (o.id !== e.id) return o;
              found = true;
              return {
                ...o,
                status: e.status as OrderRow["status"],
                remains: e.remains,
                startCount: e.startCount,
                refunded: e.refunded && Number(e.refunded) > 0 ? (Number(o.refunded) + Number(e.refunded)).toFixed(6) : o.refunded,
              };
            }),
          })),
        };
      });
      if (!found) qc.invalidateQueries({ queryKey: ["orders"] }); // a new order from another tab/API
      if (e.refunded && Number(e.refunded) > 0) qc.invalidateQueries({ queryKey: ["me"] });
      if (["completed", "partial", "canceled"].includes(e.status)) qc.invalidateQueries({ queryKey: ["notifications"] });
    });
    return () => es.close();
  }, [qc]);
}

"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";

interface Log {
  id: number;
  actorId: number;
  username: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: unknown;
  ip: string | null;
  createdAt: string;
}

const AREAS = [
  ["", "Everything"],
  ["order", "Orders"],
  ["user", "Users"],
  ["provider", "Providers"],
  ["service", "Services"],
  ["category", "Categories"],
  ["pricing", "Commission"],
  ["vip", "VIP levels"],
  ["settings", "Settings"],
  ["currency", "Currencies"],
  ["page", "Pages"],
  ["announcement", "Notices"],
];

const describe = (l: Log) => {
  const what = l.action.replace(/\./g, " › ").replace(/_/g, " ");
  return `${what}${l.targetType && l.targetId ? ` · ${l.targetType} #${l.targetId}` : ""}`;
};

export function ActivityAdmin() {
  const [area, setArea] = useState("");
  const list = useInfiniteQuery({
    queryKey: ["admin", "logs", area],
    queryFn: ({ pageParam }) => api<{ items: Log[]; nextCursor: number | null }>(`/admin/logs?${area ? `action=${area}` : ""}${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: 0,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <PageHeader
        title="Activity log"
        description="Every change made in the admin panel: who, what and when. Entries can't be edited or deleted."
        actions={
          <Select aria-label="Area" value={area} onChange={(e) => setArea(e.target.value)} className="w-48">
            {AREAS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        }
      />
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1">
        {list.isLoading ? (
          <Skeleton className="m-4 h-48" />
        ) : rows.length === 0 ? (
          <div className="grid place-items-center px-6 py-14 text-center">
            <History className="size-6 text-ink-3" aria-hidden />
            <p className="mt-3 font-medium">Nothing logged yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((l) => (
              <li key={l.id} className="grid gap-1 px-5 py-3 sm:grid-cols-[160px_1fr_auto] sm:items-start sm:gap-4">
                <span className="text-[13px] text-ink-3">{new Date(l.createdAt).toLocaleString()}</span>
                <div className="min-w-0">
                  <p className="text-[14px]">
                    <span className="font-medium">{l.username ?? `#${l.actorId}`}</span> <span className="text-ink-2">{describe(l)}</span>
                  </p>
                  {l.meta && Object.keys(l.meta as object).length > 0 ? (
                    <details className="mt-1 text-[12.5px] text-ink-3">
                      <summary className="cursor-pointer">Details</summary>
                      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-bg-subtle p-2 font-mono">{JSON.stringify(l.meta, null, 2)}</pre>
                    </details>
                  ) : null}
                </div>
                <span className="font-mono text-[12px] text-ink-3">{l.ip ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
        {list.hasNextPage && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="secondary" size="sm" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

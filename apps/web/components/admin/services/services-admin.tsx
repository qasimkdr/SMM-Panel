"use client";

import { useDeferredValue, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Boxes, Eye, EyeOff, FolderInput, Percent, Plus, Search, Trash2 } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { useCategories, useProviders } from "@/lib/hooks/admin";
import { cn } from "@/lib/cn";
import { ServiceSheet, type AdminService } from "./service-sheet";

const sourceLabel: Record<AdminService["markupSource"], string> = {
  service: "Own",
  category: "Category rate",
  provider: "Provider rate",
  global: "Global rate",
  manual: "Fixed price",
};
const usd = (v: string | null) => (v === null ? "—" : `$${Number(v).toFixed(Number(v) < 1 ? 4 : 2)}`);

export function ServicesAdmin() {
  const qc = useQueryClient();
  const toast = useToast();
  const categories = useCategories();
  const providers = useProviders();
  const [filters, setFilters] = useState({ q: "", categoryId: "", providerId: "", status: "" });
  const q = useDeferredValue(filters.q.trim());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sheet, setSheet] = useState<{ open: boolean; service: AdminService | null }>({ open: false, service: null });
  const [bulk, setBulk] = useState<null | "move" | "markup" | "delete">(null);
  const [bulkValue, setBulkValue] = useState("");

  const params = new URLSearchParams(Object.entries({ ...filters, q }).filter(([, v]) => v) as [string, string][]);
  const list = useInfiniteQuery({
    queryKey: ["admin", "services", params.toString()],
    queryFn: ({ pageParam }) => api<{ items: AdminService[]; nextCursor: number | null }>(`/admin/services?${params}&limit=100&cursor=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  const toggleStatus = useMutation({
    mutationFn: (s: AdminService) => api(`/admin/services/${s.id}`, { method: "PATCH", json: { status: s.status === "active" ? "disabled" : "active" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "services"] }),
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't update", "danger"),
  });

  const runBulk = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ affected: number }>("/admin/services/bulk", { method: "POST", json: { ids: [...selected], ...body } }),
    onSuccess: (r, body) => {
      toast(`${r.affected} service${r.affected === 1 ? "" : "s"} updated${body.action === "delete" ? ". Services with orders were hidden instead of deleted." : ""}`);
      setSelected(new Set());
      setBulk(null);
      setBulkValue("");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Bulk action failed", "danger"),
  });

  const allVisible = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const set = (k: keyof typeof filters) => (v: string) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="pb-24">
      <PageHeader
        title="Services"
        description="Everything customers can order. Provider services are priced by your commission; your own services use a fixed price."
        actions={
          <Button onClick={() => setSheet({ open: true, service: null })}>
            <Plus className="size-4" aria-hidden /> New service
          </Button>
        }
      />

      <div className="grid gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-1 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_0.8fr]">
        <label className="relative">
          <span className="sr-only">Search services</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            value={filters.q}
            onChange={(e) => set("q")(e.target.value)}
            placeholder="Search name, ID or provider ID"
            className="h-10 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-[14px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
          />
        </label>
        <Select aria-label="Category" value={filters.categoryId} onChange={(e) => set("categoryId")(e.target.value)}>
          <option value="">All categories</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Source" value={filters.providerId} onChange={(e) => set("providerId")(e.target.value)}>
          <option value="">All sources</option>
          {(providers.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Status" value={filters.status} onChange={(e) => set("status")(e.target.value)}>
          <option value="">Any status</option>
          <option value="active">Visible</option>
          <option value="disabled">Hidden</option>
        </Select>
      </div>

      <div className="mt-5 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-[14px]">
            <thead className="border-b border-line bg-surface-2 text-[12px] text-ink-3">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all loaded services"
                    className="size-4 accent-[var(--accent)]"
                    checked={allVisible}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                  />
                </th>
                <th className="px-2 py-3 font-medium">ID</th>
                <th className="px-2 py-3 font-medium">Service</th>
                <th className="px-2 py-3 font-medium">Source</th>
                <th className="px-2 py-3 text-right font-medium">Cost / 1k</th>
                <th className="px-2 py-3 text-right font-medium">Price / 1k</th>
                <th className="px-2 py-3 text-right font-medium">Profit</th>
                <th className="px-4 py-3 text-right font-medium">Visible</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading &&
                [0, 1, 2, 3].map((i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-4 py-3">
                      <Skeleton className="h-8" />
                    </td>
                  </tr>
                ))}
              {rows.map((s) => {
                const on = selected.has(s.id);
                return (
                  <tr key={s.id} className={cn("group border-b border-line transition-colors last:border-0 hover:bg-bg-subtle/60", on && "bg-accent-soft/40", s.status === "disabled" && "text-ink-3")}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.name}`}
                        className="size-4 accent-[var(--accent)]"
                        checked={on}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const n = new Set(prev);
                            e.target.checked ? n.add(s.id) : n.delete(s.id);
                            return n;
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-3 font-mono text-[12.5px] text-ink-3">{s.id}</td>
                    <td className="max-w-[340px] px-2 py-3">
                      <button onClick={() => setSheet({ open: true, service: s })} className="block max-w-full truncate text-left font-medium text-ink hover:text-accent hover:underline">
                        {s.name}
                      </button>
                      <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{s.categoryName}</p>
                    </td>
                    <td className="px-2 py-3">
                      <p className="text-[13px]">{s.providerName ?? "Manual"}</p>
                      <Badge tone={s.markupSource === "service" ? "accent" : "neutral"} className="mt-1">
                        {sourceLabel[s.markupSource]}
                        {s.markupSource === "service" && s.markup !== null ? ` ${Number(s.markup)}%` : ""}
                      </Badge>
                    </td>
                    <td className="tabular px-2 py-3 text-right font-mono text-[13px] text-ink-3">{usd(s.providerRate)}</td>
                    <td className="tabular px-2 py-3 text-right font-mono text-[13px] font-semibold">{usd(s.sellRate)}</td>
                    <td className={cn("tabular px-2 py-3 text-right font-mono text-[13px]", s.profit && Number(s.profit) < 0 ? "text-danger" : "text-success")}>{usd(s.profit)}</td>
                    <td className="px-4 py-3 text-right">
                      <Switch hideLabel label={`${s.name} visible`} checked={s.status === "active"} onChange={() => toggleStatus.mutate(s)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!list.isLoading && rows.length === 0 && (
          <div className="grid place-items-center px-6 py-16 text-center">
            <Boxes className="size-6 text-ink-3" aria-hidden />
            <p className="mt-3 font-medium">No services found</p>
            <p className="mt-1 text-sm text-ink-3">Import from a provider or create your own service.</p>
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

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 36 }}
            className="fixed inset-x-0 bottom-4 z-40 px-4 lg:left-[256px]"
          >
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-[var(--radius-xl)] border border-line bg-surface p-2.5 pl-5 shadow-3">
              <p className="mr-auto text-[14px] font-medium">
                <span className="tabular">{selected.size}</span> selected
              </p>
              <Button variant="ghost" size="sm" onClick={() => runBulk.mutate({ action: "enable" })}>
                <Eye className="size-3.5" aria-hidden /> Show
              </Button>
              <Button variant="ghost" size="sm" onClick={() => runBulk.mutate({ action: "disable" })}>
                <EyeOff className="size-3.5" aria-hidden /> Hide
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setBulk("markup")}>
                <Percent className="size-3.5" aria-hidden /> Commission
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setBulk("move")}>
                <FolderInput className="size-3.5" aria-hidden /> Move
              </Button>
              <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setBulk("delete")}>
                <Trash2 className="size-3.5" aria-hidden /> Delete
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog
        open={bulk !== null}
        onClose={() => setBulk(null)}
        size="sm"
        title={bulk === "markup" ? "Set commission" : bulk === "move" ? "Move to category" : `Delete ${selected.size} services?`}
        description={
          bulk === "markup"
            ? "Type a number; it's a percentage. Leave empty to go back to inheriting."
            : bulk === "delete"
              ? "Services that already have orders will be hidden instead, so order history stays intact."
              : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulk(null)}>
              {bulk === "delete" ? "Keep services" : "Cancel"}
            </Button>
            <Button
              variant={bulk === "delete" ? "danger" : "primary"}
              loading={runBulk.isPending}
              onClick={() =>
                runBulk.mutate(
                  bulk === "markup"
                    ? { action: "markup", markup: bulkValue === "" ? null : bulkValue }
                    : bulk === "move"
                      ? { action: "move", categoryId: Number(bulkValue) }
                      : { action: "delete" },
                )
              }
            >
              {bulk === "delete" ? `Delete ${selected.size} services` : bulk === "move" ? "Move services" : "Apply commission"}
            </Button>
          </>
        }
      >
        {bulk === "markup" && (
          <div className="relative w-40">
            <label htmlFor="bulk-markup" className="sr-only">
              Commission percent
            </label>
            <input
              id="bulk-markup"
              autoFocus
              inputMode="decimal"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value.replace(/[^\d.\-]/g, ""))}
              placeholder="Inherit"
              className="h-11 w-full rounded-[11px] border border-line bg-surface pl-3 pr-9 text-right font-mono text-[15px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
            />
            <Percent className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          </div>
        )}
        {bulk === "move" && (
          <Select aria-label="Category" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
            <option value="" disabled>
              Choose a category
            </option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        {bulk === "delete" && <p className="text-[14px] text-ink-2">This can&apos;t be undone.</p>}
      </Dialog>

      {sheet.open && <ServiceSheet key={sheet.service?.id ?? "new"} open service={sheet.service} onClose={() => setSheet({ open: false, service: null })} />}
    </div>
  );
}

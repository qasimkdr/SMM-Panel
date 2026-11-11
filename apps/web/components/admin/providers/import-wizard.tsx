"use client";

import Link from "next/link";
import { useMemo, useState, useDeferredValue } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Download, Inbox, RefreshCw, RotateCcw, Ban, Search } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { timeAgo, useCategories, useProviders } from "@/lib/hooks/admin";
import { cn } from "@/lib/cn";

interface Item {
  service: string;
  name: string;
  type: string;
  category: string;
  rate: string;
  rateUsd: string;
  sellPreview: string;
  min: number;
  max: number;
  refill: boolean;
  cancel: boolean;
  dripfeed: boolean;
  importedAs: number | null;
}
interface CatalogResponse {
  fetchedAt: string | null;
  markup: string;
  currency: string;
  items: Item[];
}

const money = (v: string) => `$${Number(v).toFixed(Number(v) < 1 ? 4 : 2)}`;

export function ImportWizard() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const providers = useProviders();
  const categories = useCategories();
  const provider = providers.data?.find((p) => String(p.id) === id);

  const catalog = useQuery({
    queryKey: ["admin", "provider-catalog", id],
    queryFn: () => api<CatalogResponse>(`/admin/providers/${id}/catalog`),
    staleTime: 5 * 60_000,
  });
  const refresh = useMutation({
    mutationFn: () => api<CatalogResponse>(`/admin/providers/${id}/catalog?refresh=1`),
    onSuccess: (d) => {
      qc.setQueryData(["admin", "provider-catalog", id], d);
      toast(`Loaded ${d.items.length} services from the provider`);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't load the list", "danger"),
  });

  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [hideImported, setHideImported] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [destination, setDestination] = useState<"provider" | string>("provider");
  const q = useDeferredValue(query.trim().toLowerCase());

  const items = catalog.data?.items ?? [];
  const groups = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);
  const visible = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const i of items) {
      if (hideImported && i.importedAs) continue;
      if (group !== "all" && i.category !== group) continue;
      if (q && !i.name.toLowerCase().includes(q) && i.service !== q && !i.category.toLowerCase().includes(q)) continue;
      const list = map.get(i.category) ?? [];
      list.push(i);
      map.set(i.category, list);
    }
    return [...map.entries()];
  }, [items, hideImported, group, q]);

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of ids) on ? next.add(s) : next.delete(s);
      return next;
    });

  const doImport = useMutation({
    mutationFn: () =>
      api<{ imported: number; skipped: number }>(`/admin/providers/${id}/import`, {
        method: "POST",
        json: {
          items: [...selected].map((service) => (destination === "provider" ? { service } : { service, categoryId: Number(destination) })),
          keepProviderCategories: destination === "provider",
        },
      }),
    onSuccess: (r) => {
      toast(`Imported ${r.imported} service${r.imported === 1 ? "" : "s"}${r.skipped ? ` (${r.skipped} skipped: already imported)` : ""}. Prices include your commission.`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Import failed", "danger"),
  });

  return (
    <div className="pb-28">
      <Link href="/providers" className="mb-4 inline-flex items-center gap-1.5 text-[14px] text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Providers
      </Link>
      <PageHeader
        title={`Import from ${provider?.name ?? "provider"}`}
        description={
          catalog.data?.fetchedAt
            ? `${items.length} services · list loaded ${timeAgo(catalog.data.fetchedAt)} · preview at ${Number(catalog.data.markup)}% commission`
            : "Loading the provider's services…"
        }
        actions={
          <Button variant="secondary" loading={refresh.isPending} onClick={() => refresh.mutate()}>
            {!refresh.isPending && <RefreshCw className="size-4" aria-hidden />} Reload list
          </Button>
        }
      />

      <div className="grid gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-1 md:grid-cols-[1.4fr_1fr_auto] md:items-end">
        <label className="relative">
          <span className="sr-only">Search provider services</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, ID or category"
            className="h-10 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-[14px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
          />
        </label>
        <Select aria-label="Provider category" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="all">All provider categories ({groups.length})</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
        <div className="flex h-10 items-center">
          <Switch checked={hideImported} onChange={setHideImported} label="Hide imported" />
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {catalog.isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : catalog.error ? (
          <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-soft p-6 text-[14px] text-danger" role="alert">
            {catalog.error instanceof ApiError ? catalog.error.message : "Couldn't load the provider's list."} Check the API URL and key in the provider settings, then reload.
          </div>
        ) : visible.length === 0 ? (
          <div className="grid place-items-center rounded-[var(--radius-xl)] border border-dashed border-line-strong px-6 py-16 text-center">
            <Inbox className="size-6 text-ink-3" aria-hidden />
            <p className="mt-3 font-medium">{items.length ? "Nothing matches" : "The provider returned no services"}</p>
            <p className="mt-1 text-sm text-ink-3">{items.length ? "Try another search, or show imported services." : "Reload the list or check the provider's settings."}</p>
          </div>
        ) : (
          visible.map(([cat, list]) => {
            const selectable = list.filter((i) => !i.importedAs).map((i) => i.service);
            const allOn = selectable.length > 0 && selectable.every((s) => selected.has(s));
            const someOn = selectable.some((s) => selected.has(s));
            return (
              <section key={cat} className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1 [content-visibility:auto] [contain-intrinsic-size:auto_400px]">
                <label className="flex cursor-pointer items-center gap-3 border-b border-line bg-surface-2 px-4 py-3">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    checked={allOn}
                    ref={(el) => {
                      if (el) el.indeterminate = !allOn && someOn;
                    }}
                    disabled={!selectable.length}
                    onChange={(e) => toggle(selectable, e.target.checked)}
                  />
                  <span className="flex-1 text-[14px] font-semibold">{cat}</span>
                  <span className="font-mono text-[12px] text-ink-3">{list.length}</span>
                </label>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-[14px]">
                    <thead className="sr-only">
                      <tr>
                        <th>Select</th>
                        <th>ID</th>
                        <th>Service</th>
                        <th>Min / Max</th>
                        <th>Your cost</th>
                        <th>Sells at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((i) => {
                        const on = selected.has(i.service);
                        return (
                          <tr
                            key={i.service}
                            onClick={() => !i.importedAs && toggle([i.service], !on)}
                            className={cn(
                              "border-b border-line transition-colors last:border-0",
                              i.importedAs ? "opacity-60" : "cursor-pointer hover:bg-bg-subtle/60",
                              on && "bg-accent-soft/50 hover:bg-accent-soft/70",
                            )}
                          >
                            <td className="w-10 px-4 py-2.5">
                              <input
                                type="checkbox"
                                aria-label={`Select ${i.name}`}
                                className="size-4 accent-[var(--accent)]"
                                checked={on || Boolean(i.importedAs)}
                                disabled={Boolean(i.importedAs)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => toggle([i.service], e.target.checked)}
                              />
                            </td>
                            <td className="w-16 px-2 py-2.5 font-mono text-[12.5px] text-ink-3">{i.service}</td>
                            <td className="px-2 py-2.5">
                              <p className="font-medium">{i.name}</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {i.importedAs && <Badge tone="info">Imported as #{i.importedAs}</Badge>}
                                {i.type !== "default" && <Badge>{i.type.replace(/_/g, " ")}</Badge>}
                                {i.refill && (
                                  <Badge tone="success">
                                    <RotateCcw className="size-3" aria-hidden /> Refill
                                  </Badge>
                                )}
                                {i.cancel && (
                                  <Badge>
                                    <Ban className="size-3" aria-hidden /> Cancel
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="tabular px-2 py-2.5 text-right font-mono text-[12.5px] text-ink-2">
                              {i.min.toLocaleString()} – {i.max.toLocaleString()}
                            </td>
                            <td className="tabular w-28 px-2 py-2.5 text-right font-mono text-[13px] text-ink-3">{money(i.rateUsd)}</td>
                            <td className="tabular w-28 px-4 py-2.5 text-right font-mono text-[13px] font-medium">{money(i.sellPreview)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })
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
            <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-[var(--radius-xl)] border border-line bg-surface p-3 pl-5 shadow-3 sm:flex-row sm:items-center">
              <p className="text-[14px] font-medium">
                <span className="tabular">{selected.size}</span> selected
              </p>
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Select aria-label="Import into" value={destination} onChange={(e) => setDestination(e.target.value)} className="sm:w-64">
                  <option value="provider">Use provider&apos;s categories</option>
                  {(categories.data ?? []).map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      Into: {c.name}
                    </option>
                  ))}
                </Select>
                <Button variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
                <Button loading={doImport.isPending} onClick={() => doImport.mutate()}>
                  {!doImport.isPending && <Download className="size-4" aria-hidden />} Import {selected.size}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {doImport.isSuccess && selected.size === 0 && (
        <p className="mt-6 text-center text-[14px] text-ink-3">
          <Link href="/services" className={buttonClass("secondary", "sm")}>
            Review imported services
          </Link>
        </p>
      )}
    </div>
  );
}

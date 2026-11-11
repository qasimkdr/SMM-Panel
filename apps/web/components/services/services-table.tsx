"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Search, RotateCcw, Ban, Droplets, Inbox } from "lucide-react";
import { PlatformIcon, platformMeta } from "@/components/platform-icon";
import { Badge } from "@/components/ui/badge";
import { formatDuration, formatMoney, type Currency } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface CatalogService {
  id: number;
  name: string;
  description: string | null;
  type: string;
  rate: string;
  min: number;
  max: number;
  refill: boolean;
  refillDays: number;
  cancel: boolean;
  dripfeed: boolean;
  avgTimeSec: number | null;
  badges: string[];
}
export interface CatalogCategory {
  id: number;
  name: string;
  slug: string;
  platform: string;
  services: CatalogService[];
}

/** Client-side filtering over one cached payload: no API call per keystroke. */
export function ServicesTable({ catalog, currency }: { catalog: CatalogCategory[]; currency?: Currency | null }) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<string>("all");
  const q = useDeferredValue(query.trim().toLowerCase());

  const platforms = useMemo(() => [...new Set(catalog.map((c) => c.platform))], [catalog]);
  const filtered = useMemo(
    () =>
      catalog
        .filter((c) => platform === "all" || c.platform === platform)
        .map((c) => ({
          ...c,
          services: q
            ? c.services.filter((s) => s.name.toLowerCase().includes(q) || String(s.id) === q || c.name.toLowerCase().includes(q))
            : c.services,
        }))
        .filter((c) => c.services.length),
    [catalog, platform, q],
  );

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search services</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or service ID"
            className="h-11 w-full rounded-[11px] border border-line bg-surface pl-10 pr-3 text-[15px] shadow-1 placeholder:text-ink-3/70 focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
          />
        </label>
      </div>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Platform">
        {["all", ...platforms].map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={platform === p}
            onClick={() => setPlatform(p)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-[background-color,color,border-color,transform] duration-200 active:scale-[0.97]",
              platform === p ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink-2 hover:border-line-strong",
            )}
          >
            {p !== "all" && <PlatformIcon platform={p} className="size-3.5" />}
            {p === "all" ? "All platforms" : (platformMeta[p]?.label ?? p)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-10 grid place-items-center rounded-[var(--radius-xl)] border border-dashed border-line-strong px-6 py-16 text-center">
          <Inbox className="size-6 text-ink-3" aria-hidden />
          <p className="mt-3 font-medium">{catalog.length === 0 ? "Services are being added" : "No services match"}</p>
          <p className="mt-1 text-sm text-ink-3">
            {catalog.length === 0 ? "Check back shortly. The catalog updates automatically." : "Try a different word or platform."}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {filtered.map((cat) => (
            <section key={cat.id} aria-labelledby={`cat-${cat.id}`} className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1">
              <h2 id={`cat-${cat.id}`} className="flex items-center gap-2.5 border-b border-line bg-surface-2 px-4 py-3 text-[14px] font-semibold">
                <PlatformIcon platform={cat.platform} className="size-4 text-ink-3" />
                {cat.name}
                <span className="font-mono text-xs font-normal text-ink-3">{cat.services.length}</span>
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-[14px]">
                  <thead className="text-[12px] text-ink-3">
                    <tr className="border-b border-line">
                      <th className="px-4 py-2.5 font-medium">ID</th>
                      <th className="px-4 py-2.5 font-medium">Service</th>
                      <th className="px-4 py-2.5 text-right font-medium">Per 1,000</th>
                      <th className="px-4 py-2.5 text-right font-medium">Min / Max</th>
                      <th className="px-4 py-2.5 text-right font-medium">Avg. time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cat.services.map((s) => (
                      <tr key={s.id} className="border-b border-line transition-colors last:border-0 hover:bg-bg-subtle/60">
                        <td className="px-4 py-3 font-mono text-[13px] text-ink-3">{s.id}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">{s.name}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {s.refill && (
                              <Badge tone="success">
                                <RotateCcw className="size-3" aria-hidden /> Refill {s.refillDays ? `${s.refillDays}d` : ""}
                              </Badge>
                            )}
                            {s.cancel && (
                              <Badge>
                                <Ban className="size-3" aria-hidden /> Cancel
                              </Badge>
                            )}
                            {s.dripfeed && (
                              <Badge tone="info">
                                <Droplets className="size-3" aria-hidden /> Drip-feed
                              </Badge>
                            )}
                            {s.badges.map((b) => (
                              <Badge key={b} tone="accent">
                                {b}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="tabular px-4 py-3 text-right font-mono text-[13px] font-medium">{formatMoney(s.rate, currency, { rate: true })}</td>
                        <td className="tabular px-4 py-3 text-right font-mono text-[13px] text-ink-2">
                          {s.min.toLocaleString()} / {s.max.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-[13px] text-ink-2">{formatDuration(s.avgTimeSec)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

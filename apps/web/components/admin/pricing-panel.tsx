"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { Calculator, Check, Info, Percent } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { TiltCard } from "@/components/ui/tilt-card";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

interface Overview {
  globalMarkup: string;
  providers: { id: number; name: string; markup: string | null }[];
  categories: { id: number; name: string; markup: string | null }[];
}

/** Input that takes a plain number and shows it as a percentage. Empty = inherit. */
function PercentInput({
  id,
  value,
  onChange,
  placeholder,
  label,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
}) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.\-]/g, ""))}
        className="h-10 w-28 rounded-[10px] border border-line bg-surface pl-3 pr-8 text-right font-mono text-[14px] tabular placeholder:text-ink-3/60 focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
      />
      <Percent className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
    </div>
  );
}

function Row({
  level,
  id,
  name,
  current,
  inheritLabel,
}: {
  level: "provider" | "category";
  id: number;
  name: string;
  current: string | null;
  inheritLabel: string;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(current ? String(Number(current)) : "");
  const [done, setDone] = useState(false);
  const dirty = value !== (current ? String(Number(current)) : "");
  const m = useMutation({
    mutationFn: () => api<{ servicesRepriced: number }>(`/admin/pricing/${level}/${id}`, { method: "PUT", json: { markup: value === "" ? null : value } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pricing"] });
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    },
  });
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1 truncate text-[14px]">{name}</span>
      <PercentInput id={`${level}-${id}`} label={`${name} commission`} value={value} onChange={setValue} placeholder={inheritLabel} />
      <Button size="sm" variant={dirty ? "primary" : "secondary"} disabled={!dirty && !done} loading={m.isPending} onClick={() => m.mutate()} className="w-20">
        {done ? <Check className="size-4" /> : "Save"}
      </Button>
      {m.error instanceof ApiError && <p className="w-full text-[13px] text-danger">{m.error.fields?.markup ?? m.error.message}</p>}
    </li>
  );
}

export function PricingPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-pricing"], queryFn: () => api<Overview>("/admin/pricing") });
  const [global, setGlobal] = useState("");
  const [result, setResult] = useState<string | null>(null);
  useEffect(() => {
    if (data) setGlobal(String(Number(data.globalMarkup)));
  }, [data]);

  const saveGlobal = useMutation({
    mutationFn: () => api<{ servicesRepriced: number }>("/admin/pricing/global", { method: "PUT", json: { markup: global } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["admin-pricing"] });
      setResult(`Saved. ${r.servicesRepriced} service${r.servicesRepriced === 1 ? "" : "s"} repriced.`);
      setTimeout(() => setResult(null), 4000);
    },
  });

  // Live preview — calculated by the backend so it matches real charges exactly.
  const [cost, setCost] = useState("1.00");
  const preview = useQuery({
    queryKey: ["pricing-preview", cost, global],
    queryFn: () =>
      api<{ sellRate: string; profitPer1000: string }>("/admin/pricing/preview", {
        method: "POST",
        json: { providerRate: cost || "0", markup: global || "0" },
      }),
    enabled: /^\d+(\.\d+)?$/.test(cost) && /^-?\d+(\.\d+)?$/.test(global || "0"),
    placeholderData: (prev) => prev,
    staleTime: Infinity,
  });

  return (
    <>
      <PageHeader
        title="Commission"
        description="Type a number and it's treated as a percentage. Users only ever see the final price."
      />

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 shadow-1">
          <h2 className="text-[15px] font-semibold">Global commission</h2>
          <p className="mt-1 text-[14px] text-ink-3">Applies to every provider service unless a provider, category or service has its own value.</p>
          {isLoading ? (
            <Skeleton className="mt-5 h-10 w-60" />
          ) : (
            <form
              className="mt-5 flex flex-wrap items-center gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                saveGlobal.mutate();
              }}
            >
              <PercentInput id="global" label="Global commission" value={global} onChange={setGlobal} />
              <Button type="submit" loading={saveGlobal.isPending}>
                Save and reprice
              </Button>
              <AnimatePresence>
                {result && (
                  <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[14px] text-success" role="status">
                    {result}
                  </motion.span>
                )}
              </AnimatePresence>
              {saveGlobal.error instanceof ApiError && (
                <p className="w-full text-[13px] text-danger">{saveGlobal.error.fields?.markup ?? saveGlobal.error.message}</p>
              )}
            </form>
          )}
          <div className="mt-6 flex gap-2.5 rounded-xl bg-bg-subtle px-3.5 py-3 text-[13px] text-ink-2">
            <Info className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
            <p>
              Order of priority: <strong className="font-medium">service</strong> → <strong className="font-medium">category</strong> →{" "}
              <strong className="font-medium">provider</strong> → <strong className="font-medium">global</strong>. Leave a field empty to inherit.
              VIP discounts are applied after commission.
            </p>
          </div>
        </section>

        <TiltCard max={5} className="p-6">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Calculator className="size-4 text-ink-3" aria-hidden /> Preview
          </h2>
          <div className="mt-5 grid gap-1.5">
            <label htmlFor="cost" className="text-[13px] text-ink-3">
              Provider price per 1,000 (USD)
            </label>
            <input
              id="cost"
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ""))}
              className="h-10 rounded-[10px] border border-line bg-surface px-3 font-mono text-[14px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
            />
          </div>
          <dl className="depth-1 mt-5 space-y-2.5 text-[14px]">
            {[
              ["Your cost", cost ? `$${Number(cost).toFixed(4)}` : "—", ""],
              ["Commission", `${global || 0}%`, ""],
              ["User pays", preview.data ? `$${Number(preview.data.sellRate).toFixed(4)}` : "—", "text-ink font-semibold"],
              ["Your profit", preview.data ? `$${Number(preview.data.profitPer1000).toFixed(4)}` : "—", "text-success font-medium"],
            ].map(([k, v, cls]) => (
              <div key={k} className="flex items-center justify-between border-b border-dashed border-line pb-2.5 last:border-0">
                <dt className="text-ink-3">{k}</dt>
                <dd className={cn("tabular font-mono", cls)}>{v}</dd>
              </div>
            ))}
          </dl>
        </TiltCard>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {(["provider", "category"] as const).map((level) => {
          const rows = level === "provider" ? data?.providers : data?.categories;
          return (
            <section key={level} className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1">
              <h2 className="border-b border-line bg-surface-2 px-4 py-3 text-[14px] font-semibold">
                {level === "provider" ? "By provider" : "By category"}
                <span className="ml-2 font-normal text-ink-3">Empty = inherit</span>
              </h2>
              {isLoading ? (
                <Skeleton className="m-4 h-24" />
              ) : rows && rows.length ? (
                <ul className="divide-y divide-line">
                  {rows.map((r) => (
                    <Row key={r.id} level={level} id={r.id} name={r.name} current={r.markup} inheritLabel={String(Number(data!.globalMarkup))} />
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-8 text-center text-[14px] text-ink-3">
                  {level === "provider" ? "No providers yet. Add one to import services." : "No categories yet."}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

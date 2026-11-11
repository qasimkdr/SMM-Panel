"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";

interface CurrencyRow {
  code: string;
  name: string;
  symbol: string;
  rate: string;
  autoRate: boolean;
  decimals: number;
  enabled: boolean;
  updatedAt: string;
}

function RateInput({ c, onSave }: { c: CurrencyRow; onSave: (rate: string) => void }) {
  const [v, setV] = useState(String(Number(c.rate)));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v !== String(Number(c.rate))) onSave(v);
      }}
    >
      <label className="sr-only" htmlFor={`rate-${c.code}`}>
        Units of {c.code} per 1 USD
      </label>
      <input
        id={`rate-${c.code}`}
        inputMode="decimal"
        value={v}
        disabled={c.code === "USD"}
        onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))}
        onBlur={() => v !== String(Number(c.rate)) && onSave(v)}
        className="h-9 w-32 rounded-[9px] border border-line bg-surface px-2.5 text-right font-mono text-[13px] tabular focus:border-accent focus:shadow-[var(--ring)] focus:outline-none disabled:opacity-60"
      />
    </form>
  );
}

export function CurrenciesAdmin() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "currencies"], queryFn: () => api<CurrencyRow[]>("/admin/currencies") });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "currencies"] });
  const patch = useMutation({
    mutationFn: ({ code, body }: { code: string; body: Record<string, unknown> }) => api(`/admin/currencies/${code}`, { method: "PATCH", json: body }),
    onSuccess: () => {
      toast("Saved");
      refresh();
    },
    onError: (e) => toast(e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0]! : e.message) : "Couldn't save", "danger"),
  });
  const update = useMutation({
    mutationFn: () => api("/admin/currencies/refresh", { method: "POST" }),
    onSuccess: () => {
      toast("Updating rates. Automatic currencies refresh within a minute.");
      setTimeout(refresh, 8000);
    },
  });

  return (
    <>
      <PageHeader
        title="Currencies"
        description="Money is always stored in USD. Customers see prices converted at these rates. Automatic rates update daily; type a rate to fix it manually."
        actions={
          <Button variant="secondary" loading={update.isPending} onClick={() => update.mutate()}>
            {!update.isPending && <RefreshCw className="size-4" aria-hidden />} Update rates now
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[14px]">
              <thead className="border-b border-line bg-surface-2 text-[12px] text-ink-3">
                <tr>
                  <th className="px-4 py-3 font-medium">Currency</th>
                  <th className="px-2 py-3 font-medium">Rate (per $1)</th>
                  <th className="px-2 py-3 font-medium">Mode</th>
                  <th className="px-2 py-3 font-medium">Example</th>
                  <th className="px-4 py-3 text-right font-medium">Offered</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((c) => (
                  <tr key={c.code} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {c.code} <span className="font-normal text-ink-3">· {c.name}</span>
                      </p>
                    </td>
                    <td className="px-2 py-3">
                      <RateInput key={c.rate} c={c} onSave={(rate) => patch.mutate({ code: c.code, body: { rate } })} />
                    </td>
                    <td className="px-2 py-3">
                      {c.code === "USD" ? (
                        <Badge>Base</Badge>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Switch hideLabel label={`${c.code} automatic rate`} checked={c.autoRate} onChange={(v) => patch.mutate({ code: c.code, body: { autoRate: v } })} />
                          <span className="text-[13px] text-ink-3">{c.autoRate ? "Automatic" : "Manual"}</span>
                        </div>
                      )}
                    </td>
                    <td className="tabular px-2 py-3 font-mono text-[13px] text-ink-2">
                      $10 = {c.symbol} {(10 * Number(c.rate)).toLocaleString("en-US", { maximumFractionDigits: c.decimals })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Switch hideLabel label={`Offer ${c.code}`} checked={c.enabled} disabled={c.code === "USD"} onChange={(v) => patch.mutate({ code: c.code, body: { enabled: v } })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

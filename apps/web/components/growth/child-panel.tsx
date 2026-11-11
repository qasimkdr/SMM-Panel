"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, CheckCircle2, Globe, Server } from "lucide-react";
import { childPanelSchema } from "@smm/shared";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TiltCard } from "@/components/ui/tilt-card";
import { FormAlert } from "@/components/auth/form-alert";
import { useForm } from "@/components/auth/use-form";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useCurrencies, useCurrency } from "@/lib/hooks/queries";

interface Panel {
  id: number;
  domain: string;
  currency: string;
  adminUsername: string;
  price: string;
  status: "pending" | "active" | "suspended" | "canceled";
  expiresAt: string | null;
  autoRenew: boolean;
}

const statusTone = { pending: "warning", active: "success", suspended: "danger", canceled: "neutral" } as const;
const statusLabel = { pending: "Being set up", active: "Live", suspended: "Suspended", canceled: "Canceled" };

export function ChildPanelPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const currency = useCurrency();
  const currencies = useCurrencies();
  const { data, isLoading } = useQuery({ queryKey: ["child-panels"], queryFn: () => api<{ enabled: boolean; monthlyPrice: string; panels: Panel[] }>("/child-panels") });
  const { errors, formError, pending, submit } = useForm(childPanelSchema);
  const renew = useMutation({
    mutationFn: ({ id, autoRenew }: { id: number; autoRenew: boolean }) => api(`/child-panels/${id}`, { method: "PATCH", json: { autoRenew } }),
    onSuccess: () => (toast("Saved"), qc.invalidateQueries({ queryKey: ["child-panels"] })),
  });

  if (!isLoading && data && !data.enabled) return <PageHeader title="Child panel" description="Child panels aren't available right now." />;

  return (
    <>
      <PageHeader title="Child panel" description="Your own panel under your own domain, with our services as its provider. You set your prices; we handle delivery." />
      {isLoading || !data ? (
        <Skeleton className="h-80" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <TiltCard max={4} className="p-6">
            <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
              <Boxes className="size-5" aria-hidden />
            </span>
            <p className="depth-1 tabular mt-4 text-[30px] font-semibold tracking-[-0.02em]">
              {formatMoney(data.monthlyPrice, currency)}
              <span className="text-[15px] font-normal text-ink-3"> / month</span>
            </p>
            <ul className="mt-4 grid gap-2 text-[14px] text-ink-2">
              {["Your domain, your brand", "All our services, connected automatically", "Your own customers, prices and admin panel", "Renews monthly from your balance; turn off anytime"].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {t}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[13px] text-ink-3">Point your domain&apos;s nameservers or DNS to us after ordering. Setup usually takes up to 24 hours; we&apos;ll notify you when it&apos;s live.</p>
          </TiltCard>

          <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1 sm:p-6">
            <h2 className="text-[15px] font-semibold">Order a child panel</h2>
            <form
              noValidate
              className="mt-4 grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                submit({ domain: fd.get("domain"), currency: fd.get("currency"), adminUsername: fd.get("adminUsername") }, async (v) => {
                  await api("/child-panels", { method: "POST", json: v });
                  toast("Ordered. We'll notify you when it's live.");
                  (e.target as HTMLFormElement).reset();
                  qc.invalidateQueries({ queryKey: ["child-panels"] });
                  qc.invalidateQueries({ queryKey: ["me"] });
                });
              }}
            >
              <FormAlert message={formError} />
              <Field name="domain" label="Domain" placeholder="mypanel.com" error={errors.domain} hint="A domain you own." />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select name="currency" label="Panel currency" defaultValue="USD">
                  {(currencies.data ?? []).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </Select>
                <Field name="adminUsername" label="Admin username" error={errors.adminUsername} />
              </div>
              <Button type="submit" loading={pending} className="justify-self-start">
                Order for {formatMoney(data.monthlyPrice, currency)}
              </Button>
            </form>
          </section>

          {data.panels.length > 0 && (
            <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1 sm:p-6 lg:col-span-2">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <Server className="size-4 text-ink-3" aria-hidden /> Your panels
              </h2>
              <ul className="mt-3 divide-y divide-line">
                {data.panels.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-4 py-3">
                    <Globe className="size-4 text-ink-3" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{p.domain}</span>
                      <span className="text-[12.5px] text-ink-3">
                        Admin: {p.adminUsername} · {p.expiresAt ? `renews ${new Date(p.expiresAt).toLocaleDateString()}` : "starts when it goes live"}
                      </span>
                    </span>
                    <Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge>
                    {p.status === "active" && <Switch label="Auto-renew" checked={p.autoRenew} onChange={(v) => renew.mutate({ id: p.id, autoRenew: v })} />}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

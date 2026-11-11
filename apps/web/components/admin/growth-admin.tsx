"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Gift, Globe, Plus, Ticket, X } from "lucide-react";
import { couponSchema } from "@smm/shared";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useForm } from "@/components/auth/use-form";
import { FormAlert } from "@/components/auth/form-alert";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

const usd = (v: string | number) => `$${Number(v).toFixed(2)}`;
const fail = (toast: ReturnType<typeof useToast>) => (e: unknown) => toast(e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0]! : e.message) : "Something went wrong", "danger");

/* ───────────── Coupons ───────────── */
interface Coupon {
  id: number;
  code: string;
  value: string;
  maxUses: number | null;
  used: number;
  perUserLimit: number;
  expiresAt: string | null;
  status: "active" | "disabled";
}

function NewCoupon({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { errors, formError, pending, submit } = useForm(couponSchema);
  return (
    <Dialog
      open
      onClose={onClose}
      title="New promo code"
      description="Customers redeem it on the Add funds page to get balance."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="coupon-form" loading={pending}>
            Create code
          </Button>
        </>
      }
    >
      <form
        id="coupon-form"
        noValidate
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const max = String(fd.get("maxUses") || "");
          const exp = String(fd.get("expiresAt") || "");
          submit(
            { code: fd.get("code"), value: fd.get("value"), maxUses: max ? Number(max) : null, perUserLimit: Number(fd.get("perUserLimit") || 1), expiresAt: exp ? new Date(exp).toISOString() : null, status: "active" },
            async (v) => {
              await api("/admin/coupons", { method: "POST", json: v });
              toast(`Code ${v.code} created`);
              qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
              onClose();
            },
          );
        }}
      >
        <FormAlert message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="code" label="Code" placeholder="WELCOME5" error={errors.code} autoFocus className="[&_input]:uppercase" />
          <Field name="value" label="Balance it adds (USD)" inputMode="decimal" placeholder="5" error={errors.value} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="maxUses" label="Total uses (optional)" inputMode="numeric" placeholder="Unlimited" />
          <Field name="perUserLimit" label="Per customer" inputMode="numeric" defaultValue="1" />
          <Field name="expiresAt" label="Expires (optional)" type="datetime-local" />
        </div>
      </form>
    </Dialog>
  );
}

export function CouponsAdmin() {
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "coupons"], queryFn: () => api<Coupon[]>("/admin/coupons") });
  const patch = useMutation({ mutationFn: ({ id, status }: { id: number; status: string }) => api(`/admin/coupons/${id}`, { method: "PATCH", json: { status } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "coupons"] }), onError: fail(toast) });
  return (
    <>
      <PageHeader
        title="Promo codes"
        description="Codes that add balance. Usage limits are exact even when many people redeem at once."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> New code
          </Button>
        }
      />
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1">
        {isLoading ? (
          <Skeleton className="m-4 h-40" />
        ) : !data?.length ? (
          <div className="grid place-items-center px-6 py-14 text-center">
            <Ticket className="size-6 text-ink-3" aria-hidden />
            <p className="mt-3 font-medium">No promo codes yet</p>
            <p className="mt-1 text-sm text-ink-3">Use them for launches, giveaways or to win back customers.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[14px]">
              <thead className="border-b border-line bg-surface-2 text-[12px] text-ink-3">
                <tr>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-2 py-3 text-right font-medium">Adds</th>
                  <th className="px-2 py-3 font-medium">Used</th>
                  <th className="px-2 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 text-right font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => {
                  const expired = c.expiresAt && new Date(c.expiresAt).getTime() < Date.now();
                  const full = c.maxUses !== null && c.used >= c.maxUses;
                  return (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <span className="font-mono font-medium">{c.code}</span>
                        {(expired || full) && (
                          <Badge className="ml-2" tone="warning">
                            {expired ? "Expired" : "Used up"}
                          </Badge>
                        )}
                      </td>
                      <td className="tabular px-2 py-3 text-right font-mono">{usd(c.value)}</td>
                      <td className="tabular px-2 py-3">
                        {c.used}
                        {c.maxUses !== null ? ` / ${c.maxUses}` : ""} <span className="text-[12px] text-ink-3">· {c.perUserLimit} per customer</span>
                      </td>
                      <td className="px-2 py-3 text-[13px] text-ink-3">{c.expiresAt ? new Date(c.expiresAt).toLocaleString() : "Never"}</td>
                      <td className="px-4 py-3 text-right">
                        <Switch hideLabel label={`${c.code} active`} checked={c.status === "active"} onChange={(v) => patch.mutate({ id: c.id, status: v ? "active" : "disabled" })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {creating && <NewCoupon onClose={() => setCreating(false)} />}
    </>
  );
}

/* ───────────── Affiliates ───────────── */
interface Payout {
  id: number;
  userId: number;
  username: string;
  email: string;
  amount: string;
  method: "balance" | "external";
  details: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export function AffiliatesAdmin() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState("pending");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "aff", status],
    queryFn: () => api<{ payouts: Payout[]; top: { referrerId: number; username: string; total: string; orders: number }[] }>(`/admin/affiliates/payouts?status=${status}`),
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "approve" | "reject" }) => api(`/admin/affiliates/payouts/${id}`, { method: "POST", json: { action } }),
    onSuccess: (_r, v) => (toast(v.action === "approve" ? "Payout approved. Send it, then you're done." : "Payout declined; the amount went back to their earnings."), qc.invalidateQueries({ queryKey: ["admin", "aff"] })),
    onError: fail(toast),
  });
  return (
    <>
      <PageHeader title="Affiliates" description="Payout requests and your best referrers. Commission % and minimum payout are in Settings → Affiliates." />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-semibold">Payout requests</h2>
            <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Declined</option>
              <option value="all">All</option>
            </Select>
          </div>
          {isLoading ? (
            <Skeleton className="m-4 h-32" />
          ) : !data?.payouts.length ? (
            <p className="px-4 py-12 text-center text-[14px] text-ink-3">No {status === "all" ? "" : status} payout requests.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.payouts.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">
                      {p.username} <span className="font-normal text-ink-3">· {p.email}</span>
                    </span>
                    <span className="block text-[12.5px] text-ink-3">
                      {p.method === "balance" ? "Moved to balance" : `Send to: ${p.details}`} · {new Date(p.createdAt).toLocaleString()}
                    </span>
                  </span>
                  <span className="tabular font-mono font-semibold">{usd(p.amount)}</span>
                  {p.status === "pending" ? (
                    <span className="flex gap-1.5">
                      <Button size="sm" onClick={() => act.mutate({ id: p.id, action: "approve" })} loading={act.isPending && act.variables?.id === p.id && act.variables.action === "approve"}>
                        <Check className="size-3.5" aria-hidden /> Approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: p.id, action: "reject" })}>
                        <X className="size-3.5" aria-hidden /> Decline
                      </Button>
                    </span>
                  ) : (
                    <Badge tone={p.status === "approved" ? "success" : "danger"}>{p.status === "approved" ? "Approved" : "Declined"}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Gift className="size-4 text-ink-3" aria-hidden /> Top referrers
          </h2>
          {data?.top.length ? (
            <ol className="mt-3 divide-y divide-line">
              {data.top.map((t, i) => (
                <li key={t.referrerId} className="flex items-center gap-3 py-2.5 text-[14px]">
                  <span className="font-mono text-[12px] text-ink-3">{i + 1}</span>
                  <span className="flex-1">{t.username}</span>
                  <span className="text-[12.5px] text-ink-3">{t.orders} orders</span>
                  <span className="tabular font-mono font-medium">{usd(t.total)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-6 text-center text-[14px] text-ink-3">No commission earned yet.</p>
          )}
        </section>
      </div>
    </>
  );
}

/* ───────────── Child panels ───────────── */
interface AdminPanel {
  id: number;
  userId: number;
  username: string;
  domain: string;
  currency: string;
  adminUsername: string;
  price: string;
  status: "pending" | "active" | "suspended" | "canceled";
  expiresAt: string | null;
  autoRenew: boolean;
  notes: string | null;
  createdAt: string;
}

export function ChildPanelsAdmin() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "panels"], queryFn: () => api<AdminPanel[]>("/admin/child-panels") });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api(`/admin/child-panels/${id}`, { method: "PATCH", json: body }),
    onSuccess: () => (toast("Saved. The customer was notified."), qc.invalidateQueries({ queryKey: ["admin", "panels"] })),
    onError: fail(toast),
  });
  return (
    <>
      <PageHeader
        title="Child panels"
        description="Set up the panel on the customer's domain, then mark it Live: their 30-day period starts then and renews automatically from their balance."
      />
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1">
        {isLoading ? (
          <Skeleton className="m-4 h-32" />
        ) : !data?.length ? (
          <div className="grid place-items-center px-6 py-14 text-center">
            <Globe className="size-6 text-ink-3" aria-hidden />
            <p className="mt-3 font-medium">No child panels ordered yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {data.map((p) => (
              <li key={p.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1.4fr_1fr_auto] md:items-center">
                <span className="min-w-0">
                  <span className="block font-medium">{p.domain}</span>
                  <span className="text-[12.5px] text-ink-3">
                    {p.username} · admin login {p.adminUsername} · {p.currency} · {usd(p.price)}/mo
                  </span>
                </span>
                <span className="text-[13px] text-ink-3">
                  {p.expiresAt ? `${p.status === "active" ? "Renews" : "Expired"} ${new Date(p.expiresAt).toLocaleDateString()}` : `Ordered ${new Date(p.createdAt).toLocaleDateString()}`}
                  {!p.autoRenew && " · auto-renew off"}
                </span>
                <Select
                  aria-label={`${p.domain} status`}
                  value={p.status}
                  onChange={(e) => patch.mutate({ id: p.id, body: { status: e.target.value } })}
                  className={cn("w-44")}
                >
                  <option value="pending">Being set up</option>
                  <option value="active">Live</option>
                  <option value="suspended">Suspended</option>
                  <option value="canceled">Canceled</option>
                </Select>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

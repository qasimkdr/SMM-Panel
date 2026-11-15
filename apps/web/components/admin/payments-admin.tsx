"use client";

import { useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { PAYMENT_BRANDS } from "@smm/shared";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { BrandMark } from "@/components/payments/brand-mark";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

interface PaymentRow {
  id: number;
  userId: number;
  username: string | null;
  email: string | null;
  method: string | null;
  brand: string | null;
  kind: "manual" | "binance_pay" | null;
  amount: string;
  amountLocal: string | null;
  currency: string;
  txnId: string | null;
  status: "pending" | "completed" | "rejected" | "failed" | "refunded";
  hasProof: boolean;
  userNote: string | null;
  adminNote: string | null;
  meta: { binance?: { amount: string; currency: string; payer: string | null; transactionId: string }; duplicate?: boolean } | null;
  reviewedAt: string | null;
  createdAt: string;
}
interface MethodRow {
  id: number;
  name: string;
  kind: "manual" | "binance_pay";
  brand: string;
  currency: string;
  accountTitle: string | null;
  accountNumber: string | null;
  instructions: string | null;
  minAmount: string;
  maxAmount: string | null;
  status: "active" | "disabled";
  sort: number;
  hasApiKey: boolean;
}

const usd = (v: string) => `$${Number(v).toFixed(2)}`;
const local = (v: string | null, cur: string) => (v ? `${cur} ${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—");
const STATUS_TONE = { pending: "warning", completed: "success", rejected: "danger", failed: "danger", refunded: "neutral" } as const;
const STATUS_LABEL = { pending: "Waiting", completed: "Approved", rejected: "Rejected", failed: "Failed", refunded: "Refunded" } as const;

export function PaymentsAdmin() {
  const [tab, setTab] = useState<"deposits" | "methods">("deposits");
  return (
    <>
      <PageHeader title="Payments" description="Check deposits against your wallet, approve or reject them, and edit the payment methods customers see." />
      <div role="tablist" aria-label="Payments" className="mb-5 inline-flex rounded-[12px] border border-line bg-bg-subtle p-1">
        {(["deposits", "methods"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("h-9 rounded-[9px] px-4 text-[14px] font-medium transition-[background-color,color,box-shadow]", tab === t ? "bg-surface text-ink shadow-1" : "text-ink-3 hover:text-ink")}
          >
            {t === "deposits" ? "Deposits" : "Payment methods"}
          </button>
        ))}
      </div>
      {tab === "deposits" ? <Deposits /> : <Methods />}
    </>
  );
}

function Deposits() {
  const [status, setStatus] = useState("pending");
  const [open, setOpen] = useState<PaymentRow | null>(null);
  const list = useInfiniteQuery({
    queryKey: ["admin", "payments", status],
    queryFn: ({ pageParam }) => api<{ items: PaymentRow[]; nextCursor: number | null }>(`/admin/payments?status=${status}${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: 0,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
    refetchInterval: status === "pending" ? 30_000 : false,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Select aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value)} className="w-52">
          <option value="pending">Waiting for review</option>
          <option value="completed">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All deposits</option>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => list.refetch()} loading={list.isRefetching}>
          <RefreshCw className="size-3.5" aria-hidden /> Refresh
        </Button>
      </div>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[14px]">
            <thead className="border-b border-line bg-surface-2 text-[12px] text-ink-3">
              <tr>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-2 py-3 font-medium">Method</th>
                <th className="px-2 py-3 text-right font-medium">Sent</th>
                <th className="px-2 py-3 text-right font-medium">Credit</th>
                <th className="px-2 py-3 font-medium">Transaction ID</th>
                <th className="px-2 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.isLoading &&
                Array.from({ length: 4 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-3">
                      <Skeleton className="h-8" />
                    </td>
                  </tr>
                ))}
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2/60">
                  <td className="px-4 py-3">
                    <Link href={`/users/${p.userId}`} className="font-medium hover:text-accent-text">
                      {p.username ?? `#${p.userId}`}
                    </Link>
                    <p className="text-[12px] text-ink-3">{new Date(p.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
                  </td>
                  <td className="px-2 py-3">
                    <span className="flex items-center gap-2">
                      <BrandMark brand={p.brand ?? "other"} name={p.method ?? "?"} className="size-7 rounded-lg text-[10px]" />
                      {p.method ?? p.currency}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-right font-mono tabular-nums">{local(p.amountLocal, p.currency)}</td>
                  <td className="px-2 py-3 text-right font-mono tabular-nums">{usd(p.amount)}</td>
                  <td className="max-w-[180px] truncate px-2 py-3 font-mono text-[13px]">{p.txnId ?? "—"}</td>
                  <td className="px-2 py-3">
                    <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant={p.status === "pending" ? "primary" : "secondary"} onClick={() => setOpen(p)}>
                      {p.status === "pending" ? "Review" : "View"}
                    </Button>
                  </td>
                </tr>
              ))}
              {!list.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-3">
                    {status === "pending" ? "No deposits are waiting. New ones appear here automatically." : "No deposits here yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {list.hasNextPage && (
        <Button variant="secondary" className="mt-4" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
          Load more
        </Button>
      )}
      {open && <ReviewDialog payment={open} onClose={() => setOpen(null)} />}
    </>
  );
}

const REASONS = ["Payment not received", "Transaction ID doesn't match", "Amount doesn't match", "Screenshot is unclear"];

function ReviewDialog({ payment: p, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState(Number(p.amount).toFixed(2));
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const done = (msg: string) => {
    toast(msg);
    qc.invalidateQueries({ queryKey: ["admin", "payments"] });
    qc.invalidateQueries({ queryKey: ["admin", "payments-summary"] });
    onClose();
  };
  const fail = (e: unknown) => toast(e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0]! : e.message) : "Something went wrong", "danger");
  const approve = useMutation({ mutationFn: () => api(`/admin/payments/${p.id}/approve`, { method: "POST", json: { amount } }), onSuccess: () => done(`Approved. ${usd(amount)} added to ${p.username}.`), onError: fail });
  const reject = useMutation({ mutationFn: () => api(`/admin/payments/${p.id}/reject`, { method: "POST", json: { note: reason } }), onSuccess: () => done("Rejected. The customer was notified."), onError: fail });
  const check = useMutation({
    mutationFn: () => api<{ confirmed: boolean; reason?: string; amount?: string }>(`/admin/payments/${p.id}/check`, { method: "POST" }),
    onSuccess: (r) => (r.confirmed ? done(`Found on Binance. ${usd(r.amount!)} added.`) : toast(r.reason ?? "Not found yet", "danger")),
    onError: fail,
  });
  const pending = p.status === "pending";

  return (
    <Dialog
      open
      onClose={onClose}
      variant="sheet"
      title={`Deposit #${p.id}`}
      description={`${p.username ?? "Customer"} · ${p.method ?? ""} · ${new Date(p.createdAt).toLocaleString()}`}
      footer={
        pending ? (
          rejecting ? (
            <div className="flex w-full flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setRejecting(false)}>
                Back
              </Button>
              <Button variant="danger" loading={reject.isPending} disabled={reason.trim().length < 3} onClick={() => reject.mutate()}>
                Reject deposit
              </Button>
            </div>
          ) : (
            <div className="flex w-full flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setRejecting(true)}>
                <X className="size-4" aria-hidden /> Reject
              </Button>
              <Button loading={approve.isPending} disabled={!(Number(amount) > 0)} onClick={() => approve.mutate()}>
                <Check className="size-4" aria-hidden /> Approve and add {Number(amount) > 0 ? usd(amount) : ""}
              </Button>
            </div>
          )
        ) : undefined
      }
    >
      <div className="grid gap-5">
        <dl className="grid grid-cols-2 gap-3 rounded-[14px] border border-line bg-bg-subtle p-4 text-[14px]">
          <div>
            <dt className="text-[12px] text-ink-3">Customer says they sent</dt>
            <dd className="mt-0.5 font-mono text-[18px] font-semibold tabular-nums">{local(p.amountLocal, p.currency)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-3">Transaction ID</dt>
            <dd className="mt-0.5 break-all font-mono text-[15px]">{p.txnId ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-3">Customer</dt>
            <dd className="mt-0.5">
              <Link href={`/users/${p.userId}`} className="inline-flex items-center gap-1 font-medium hover:text-accent-text">
                {p.username} <ExternalLink className="size-3.5" aria-hidden />
              </Link>
              <p className="truncate text-[12px] text-ink-3">{p.email}</p>
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-3">Status</dt>
            <dd className="mt-0.5">
              <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
            </dd>
          </div>
          {p.userNote && (
            <div className="col-span-2">
              <dt className="text-[12px] text-ink-3">Note from customer</dt>
              <dd className="mt-0.5">{p.userNote}</dd>
            </div>
          )}
          {p.adminNote && (
            <div className="col-span-2">
              <dt className="text-[12px] text-ink-3">Review note</dt>
              <dd className="mt-0.5">{p.adminNote}</dd>
            </div>
          )}
        </dl>

        {p.meta?.binance && (
          <div className="rounded-[14px] border border-line p-4 text-[14px]">
            <p className="font-medium">Found in your Binance Pay history</p>
            <p className="mt-1 text-ink-2">
              {p.meta.binance.amount} {p.meta.binance.currency}
              {p.meta.binance.payer ? ` from ${p.meta.binance.payer}` : ""} · {p.meta.binance.transactionId}
            </p>
            {p.meta.duplicate && <p className="mt-1 text-danger">This transfer was already used for another deposit.</p>}
          </div>
        )}

        {p.hasProof ? (
          <figure className="overflow-hidden rounded-[14px] border border-line bg-bg-subtle">
            <a href={`/api/admin/payments/${p.id}/proof`} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/admin/payments/${p.id}/proof`} alt={`Receipt screenshot for deposit #${p.id}`} className="max-h-[420px] w-full object-contain" />
            </a>
            <figcaption className="border-t border-line px-3 py-2 text-[12px] text-ink-3">Tap the image to open it full size. Check the amount, TID and date against your wallet app.</figcaption>
          </figure>
        ) : (
          <p className="rounded-[14px] border border-dashed border-line p-4 text-[14px] text-ink-3">No screenshot was uploaded.</p>
        )}

        {pending && p.kind === "binance_pay" && (
          <Button variant="secondary" onClick={() => check.mutate()} loading={check.isPending} className="justify-self-start">
            <RefreshCw className="size-4" aria-hidden /> Check Binance again
          </Button>
        )}

        {pending &&
          (rejecting ? (
            <div className="grid gap-3">
              <Field label="Reason (the customer sees this)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} autoFocus />
              <div className="flex flex-wrap gap-2">
                {REASONS.map((r) => (
                  <button key={r} type="button" onClick={() => setReason(r)} className="rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-ink-2 hover:border-line-strong hover:text-ink">
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <Field
              label="USD to add to the balance"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              hint={p.currency !== "USD" ? `Converted from ${local(p.amountLocal, p.currency)} at today's rate. Change it if the received amount differs.` : "Change it if the received amount differs."}
            />
          ))}
      </div>
    </Dialog>
  );
}

/* ───────────── Payment methods ───────────── */

const EMPTY: Omit<MethodRow, "id" | "hasApiKey"> & { apiKey: string; apiSecret: string } = {
  name: "",
  kind: "manual",
  brand: "other",
  currency: "PKR",
  accountTitle: "",
  accountNumber: "",
  instructions: "",
  minAmount: "100",
  maxAmount: null,
  status: "active",
  sort: 0,
  apiKey: "",
  apiSecret: "",
};

function Methods() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "payment-methods"], queryFn: () => api<MethodRow[]>("/admin/payment-methods") });
  const [edit, setEdit] = useState<MethodRow | "new" | null>(null);
  const toggle = useMutation({
    mutationFn: (m: MethodRow) => {
      const { id, hasApiKey: _h, ...rest } = m;
      return api(`/admin/payment-methods/${id}`, { method: "PATCH", json: { ...rest, status: m.status === "active" ? "disabled" : "active" } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "payment-methods"] }),
    onError: (e) => toast(e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0]! : e.message) : "Something went wrong", "danger"),
  });
  if (isLoading) return <Skeleton className="h-64" />;
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEdit("new")}>
          <Plus className="size-4" aria-hidden /> Add method
        </Button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {data?.map((m) => (
          <li key={m.id} className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-1">
            <BrandMark brand={m.brand} name={m.name} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {m.name}
                {m.kind === "binance_pay" && <Badge tone={m.hasApiKey ? "success" : "neutral"}>{m.hasApiKey ? "Auto-check on" : "Manual check"}</Badge>}
              </p>
              <p className="truncate font-mono text-[13px] text-ink-2">{m.accountNumber || "No account set"}</p>
              <p className="text-[12px] text-ink-3">
                {m.currency} · min {Number(m.minAmount).toLocaleString("en-US")}
                {m.maxAmount ? ` · max ${Number(m.maxAmount).toLocaleString("en-US")}` : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Switch hideLabel label={`Show ${m.name} to customers`} checked={m.status === "active"} onChange={() => toggle.mutate(m)} />
              <Button variant="ghost" size="sm" onClick={() => setEdit(m)}>
                <Pencil className="size-3.5" aria-hidden /> Edit
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {edit && <MethodDialog method={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function MethodDialog({ method, onClose }: { method: MethodRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const currencies = useQuery({ queryKey: ["admin", "currencies"], queryFn: () => api<{ code: string; name: string }[]>("/admin/currencies") });
  const [f, setF] = useState(() => ({ ...EMPTY, ...(method ?? {}), accountTitle: method?.accountTitle ?? "", accountNumber: method?.accountNumber ?? "", instructions: method?.instructions ?? "", apiKey: "", apiSecret: "" }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const save = useMutation({
    mutationFn: () => {
      const { apiKey, apiSecret, maxAmount, ...rest } = f;
      const body = { ...rest, maxAmount: maxAmount ? maxAmount : null, sort: Number(rest.sort) || 0, ...(apiKey ? { apiKey } : {}), ...(apiSecret ? { apiSecret } : {}) };
      delete (body as Record<string, unknown>).id;
      delete (body as Record<string, unknown>).hasApiKey;
      return method ? api(`/admin/payment-methods/${method.id}`, { method: "PATCH", json: body }) : api("/admin/payment-methods", { method: "POST", json: body });
    },
    onSuccess: () => {
      toast("Saved");
      qc.invalidateQueries({ queryKey: ["admin", "payment-methods"] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      else toast(e instanceof ApiError ? e.message : "Something went wrong", "danger");
    },
  });
  const removeKey = useMutation({
    mutationFn: () => api(`/admin/payment-methods/${method!.id}/api-key`, { method: "DELETE" }),
    onSuccess: () => {
      toast("API key removed");
      qc.invalidateQueries({ queryKey: ["admin", "payment-methods"] });
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/admin/payment-methods/${method!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("Deleted");
      qc.invalidateQueries({ queryKey: ["admin", "payment-methods"] });
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Something went wrong", "danger"),
  });
  const binance = f.kind === "binance_pay";

  return (
    <Dialog
      open
      onClose={onClose}
      variant="sheet"
      title={method ? `Edit ${method.name}` : "Add payment method"}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {method ? (
            <Button variant="ghost" onClick={() => remove.mutate()} loading={remove.isPending}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save
          </Button>
        </div>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Name customers see" value={f.name} onChange={(e) => set("name", e.target.value)} error={errors.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Type" value={f.kind} onChange={(e) => set("kind", e.target.value as MethodRow["kind"])}>
            <option value="manual">Wallet / bank (you check it)</option>
            <option value="binance_pay">Binance Pay</option>
          </Select>
          <Select label="Icon" value={f.brand} onChange={(e) => set("brand", e.target.value)}>
            {PAYMENT_BRANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={binance ? "Binance Pay ID" : "Account number / ID"} value={f.accountNumber ?? ""} onChange={(e) => set("accountNumber", e.target.value)} error={errors.accountNumber} />
          <Field label={binance ? "Binance name (optional)" : "Account title"} value={f.accountTitle ?? ""} onChange={(e) => set("accountTitle", e.target.value)} error={errors.accountTitle} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Currency" value={f.currency} onChange={(e) => set("currency", e.target.value)} hint={binance ? "Use USD for USDT." : undefined}>
            {(currencies.data ?? [{ code: f.currency, name: f.currency }]).map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </Select>
          <Field label="Minimum" inputMode="decimal" value={f.minAmount} onChange={(e) => set("minAmount", e.target.value)} error={errors.minAmount} />
          <Field label="Maximum" inputMode="decimal" value={f.maxAmount ?? ""} onChange={(e) => set("maxAmount", e.target.value || null)} placeholder="No limit" error={errors.maxAmount} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="method-instructions" className="text-[13px] font-medium text-ink-2">
            Instructions for customers
          </label>
          <textarea
            id="method-instructions"
            rows={3}
            value={f.instructions ?? ""}
            onChange={(e) => set("instructions", e.target.value)}
            className="rounded-[11px] border border-line bg-surface p-3 text-[14px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
          />
        </div>
        <Field label="Order in the list" inputMode="numeric" value={String(f.sort)} onChange={(e) => set("sort", Number(e.target.value.replace(/\D/g, "")) || 0)} hint="Lower numbers show first." />
        <Switch label="Show to customers" checked={f.status === "active"} onChange={(v) => set("status", v ? "active" : "disabled")} />

        {binance && (
          <fieldset className="grid gap-3 rounded-[14px] border border-line p-4">
            <legend className="px-1 text-[14px] font-medium">Automatic check (optional)</legend>
            <p className="text-[13px] leading-relaxed text-ink-3">
              With a read-only Binance API key, deposits are confirmed and added instantly when the Order ID matches a payment you received. In Binance: Profile → API Management →
              Create API → System generated. Leave only <strong>Enable Reading</strong> ticked. Never turn on trading or withdrawals.
            </p>
            {method?.hasApiKey && <Badge tone="success">A key is saved. Leave the fields empty to keep it.</Badge>}
            <Field label="API key" value={f.apiKey} onChange={(e) => set("apiKey", e.target.value)} autoComplete="off" spellCheck={false} />
            <Field label="Secret key" type="password" value={f.apiSecret} onChange={(e) => set("apiSecret", e.target.value)} autoComplete="new-password" />
            {method?.hasApiKey && (
              <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => removeKey.mutate()} loading={removeKey.isPending}>
                Remove saved key
              </Button>
            )}
          </fieldset>
        )}
      </form>
    </Dialog>
  );
}

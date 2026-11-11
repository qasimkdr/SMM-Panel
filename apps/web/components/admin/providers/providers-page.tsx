"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, MoreHorizontal, Pencil, Plug, Plus, RefreshCw, Server, Trash2 } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TiltCard } from "@/components/ui/tilt-card";
import { Stagger, StaggerItem } from "@/components/ui/reveal";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { timeAgo, useProviders, type AdminProvider } from "@/lib/hooks/admin";
import { ProviderForm } from "./provider-form";

function ProviderCard({ p, onEdit, onDelete }: { p: AdminProvider; onEdit: () => void; onDelete: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "providers"] });

  const test = useMutation({
    mutationFn: () => api<{ balance: string; currency: string }>(`/admin/providers/${p.id}/test`, { method: "POST" }),
    onSuccess: (r) => toast(`Connected. Balance: ${r.balance} ${r.currency}`),
    onError: (e) => toast(e instanceof ApiError ? e.message : "Test failed", "danger"),
    onSettled: refresh,
  });
  const sync = useMutation({
    mutationFn: () => api<{ items: number; updated: number; disabled: number; repriced: number }>(`/admin/providers/${p.id}/sync`, { method: "POST" }),
    onSuccess: (r) =>
      toast(`Synced ${r.items} services. ${r.updated} updated, ${r.repriced} repriced${r.disabled ? `, ${r.disabled} hidden (removed by provider)` : ""}.`),
    onError: (e) => toast(e instanceof ApiError ? e.message : "Sync failed", "danger"),
    onSettled: refresh,
  });

  const healthy = p.errorCount === 0;
  const low = p.lowBalanceAlert && p.balance && Number(p.balance) < Number(p.lowBalanceAlert);

  return (
    <TiltCard max={4} className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-bg-subtle text-ink-2">
            <Server className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold">{p.name}</h2>
            <p className="truncate font-mono text-[12px] text-ink-3">{p.apiUrl.replace(/^https?:\/\//, "")}</p>
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenu((m) => !m)}
            onBlur={() => setTimeout(() => setMenu(false), 150)}
            aria-label={`More actions for ${p.name}`}
            aria-expanded={menu}
            className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-bg-subtle hover:text-ink"
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-3">
              <button role="menuitem" onClick={onEdit} className="flex w-full items-center gap-2 px-3 py-2 text-[14px] hover:bg-bg-subtle">
                <Pencil className="size-3.5 text-ink-3" aria-hidden /> Edit
              </button>
              <button role="menuitem" onClick={onDelete} className="flex w-full items-center gap-2 px-3 py-2 text-[14px] text-danger hover:bg-danger-soft">
                <Trash2 className="size-3.5" aria-hidden /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="depth-1 mt-5 grid grid-cols-3 gap-3">
        <div>
          <p className="text-[12px] text-ink-3">Balance</p>
          <p className={`tabular mt-0.5 text-[17px] font-semibold ${low ? "text-danger" : ""}`}>
            {p.balance ? Number(p.balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
            <span className="ml-1 text-[12px] font-normal text-ink-3">{p.currency}</span>
          </p>
        </div>
        <div>
          <p className="text-[12px] text-ink-3">Services</p>
          <p className="tabular mt-0.5 text-[17px] font-semibold">{p.serviceCount}</p>
        </div>
        <div>
          <p className="text-[12px] text-ink-3">Last sync</p>
          <p className="mt-1 text-[14px]">{timeAgo(p.lastSyncAt)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {p.status === "disabled" ? <Badge>Disabled</Badge> : healthy ? <Badge tone="success">Connected</Badge> : <Badge tone="danger">Error</Badge>}
        <Badge>{p.driver === "v2" ? "API v2" : "Custom"}</Badge>
        {p.markup !== null && <Badge tone="accent">{Number(p.markup)}% commission</Badge>}
        {!p.syncEnabled && <Badge tone="warning">Auto-sync off</Badge>}
      </div>
      {p.lastError && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {p.lastError}
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-1.5 pt-5">
        <Link href={`/providers/${p.id}/import`} className={buttonClass("primary", "sm")}>
          <Download className="size-3.5" aria-hidden /> Import
        </Link>
        <Button variant="secondary" size="sm" loading={sync.isPending} onClick={() => sync.mutate()}>
          {!sync.isPending && <RefreshCw className="size-3.5" aria-hidden />} Sync now
        </Button>
        <Button variant="ghost" size="sm" loading={test.isPending} onClick={() => test.mutate()}>
          {!test.isPending && <Plug className="size-3.5" aria-hidden />} Test
        </Button>
      </div>
    </TiltCard>
  );
}

export function ProvidersPage() {
  const { data, isLoading } = useProviders();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<{ open: boolean; provider: AdminProvider | null }>({ open: false, provider: null });
  const [deleting, setDeleting] = useState<AdminProvider | null>(null);

  const del = useMutation({
    mutationFn: (id: number) => api(`/admin/providers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("Provider deleted");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't delete", "danger"),
  });

  return (
    <>
      <PageHeader
        title="Providers"
        description="Panels you buy services from. Prices sync automatically and your commission is added on top."
        actions={
          <Button onClick={() => setForm({ open: true, provider: null })}>
            <Plus className="size-4" aria-hidden /> Add provider
          </Button>
        }
      />
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-60" />
          ))}
        </div>
      ) : !data?.length ? (
        <div className="grid place-items-center rounded-[var(--radius-xl)] border border-dashed border-line-strong px-6 py-20 text-center">
          <Server className="size-7 text-ink-3" aria-hidden />
          <p className="mt-3 text-[17px] font-medium">No providers yet</p>
          <p className="mt-1 max-w-sm text-sm text-ink-3">Add the API URL and key from a provider panel, then import their services in a few clicks.</p>
          <Button className="mt-5" onClick={() => setForm({ open: true, provider: null })}>
            <Plus className="size-4" aria-hidden /> Add provider
          </Button>
        </div>
      ) : (
        <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((p) => (
            <StaggerItem key={p.id} className="h-full">
              <ProviderCard p={p} onEdit={() => setForm({ open: true, provider: p })} onDelete={() => setDeleting(p)} />
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {form.open && <ProviderForm open onClose={() => setForm({ open: false, provider: null })} provider={form.provider} />}

      <Dialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        size="sm"
        title={`Delete ${deleting?.name ?? "provider"}?`}
        description={`Its ${deleting?.serviceCount ?? 0} imported services will be removed too. Providers with orders can only be disabled.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep provider
            </Button>
            <Button variant="danger" loading={del.isPending} onClick={() => deleting && del.mutate(deleting.id)}>
              Delete provider
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-ink-2">This can&apos;t be undone.</p>
      </Dialog>
    </>
  );
}

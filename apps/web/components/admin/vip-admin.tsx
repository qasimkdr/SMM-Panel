"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Plus, Trash2 } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { TiltCard } from "@/components/ui/tilt-card";
import { Stagger, StaggerItem } from "@/components/ui/reveal";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";

interface Tier {
  id: number;
  name: string;
  minSpent: string;
  discount: string;
  color: string;
  users: number;
}

function TierCard({ t, onSaved }: { t: Tier; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: t.name, minSpent: String(Number(t.minSpent)), discount: String(Number(t.discount)), color: t.color });
  const dirty = form.name !== t.name || form.minSpent !== String(Number(t.minSpent)) || form.discount !== String(Number(t.discount)) || form.color !== t.color;
  const fail = (e: unknown) => toast(e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0]! : e.message) : "Couldn't save", "danger");
  const save = useMutation({ mutationFn: () => api(`/admin/vip-tiers/${t.id}`, { method: "PATCH", json: form }), onSuccess: () => (toast("Level saved. Customers were re-assigned."), onSaved()), onError: fail });
  const del = useMutation({ mutationFn: () => api(`/admin/vip-tiers/${t.id}`, { method: "DELETE" }), onSuccess: () => (toast("Level deleted"), onSaved()), onError: fail });
  const input = "h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-[14px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none";

  return (
    <TiltCard max={4} className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <span className="grid size-10 place-items-center rounded-xl" style={{ background: `${form.color}22`, color: form.color }}>
          <Crown className="size-[18px]" aria-hidden />
        </span>
        <span className="text-[13px] text-ink-3">
          {t.users} customer{t.users === 1 ? "" : "s"}
        </span>
      </div>
      <div className="depth-1 mt-4 grid gap-3">
        <label className="grid gap-1 text-[13px] text-ink-2">
          Name
          <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-[13px] text-ink-2">
            Spend from ($)
            <input className={`${input} font-mono`} inputMode="decimal" value={form.minSpent} onChange={(e) => setForm({ ...form, minSpent: e.target.value.replace(/[^\d.]/g, "") })} />
          </label>
          <label className="grid gap-1 text-[13px] text-ink-2">
            Discount (%)
            <input className={`${input} font-mono`} inputMode="decimal" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value.replace(/[^\d.]/g, "") })} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="size-8 cursor-pointer rounded-lg border border-line bg-surface p-0.5" aria-label={`${t.name} badge color`} />
          Badge color
        </label>
      </div>
      <div className="mt-auto flex gap-2 pt-5">
        <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" loading={del.isPending} onClick={() => del.mutate()} aria-label={`Delete ${t.name}`}>
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>
    </TiltCard>
  );
}

export function VipAdmin() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "vip"], queryFn: () => api<Tier[]>("/admin/vip-tiers") });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "vip"] });
  const add = useMutation({
    mutationFn: () => {
      const top = Math.max(0, ...(data ?? []).map((t) => Number(t.minSpent)));
      return api("/admin/vip-tiers", { method: "POST", json: { name: "New level", minSpent: String(top ? top * 2 : 100), discount: "1", color: "#8a857c" } });
    },
    onSuccess: () => (toast("Level added"), refresh()),
  });
  return (
    <>
      <PageHeader
        title="VIP levels"
        description="Customers move up automatically when their lifetime spend reaches a level. The discount applies after your commission. A personal discount on a user overrides this."
        actions={
          <Button onClick={() => add.mutate()} loading={add.isPending}>
            <Plus className="size-4" aria-hidden /> Add level
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(data ?? []).map((t) => (
            <StaggerItem key={t.id} className="h-full">
              <TierCard key={`${t.id}-${t.minSpent}-${t.discount}-${t.name}`} t={t} onSaved={refresh} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </>
  );
}

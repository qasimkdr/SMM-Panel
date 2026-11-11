"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Reorder, useDragControls } from "motion/react";
import { FolderTree, GripVertical, Plus, Trash2 } from "lucide-react";
import { PLATFORMS } from "@smm/shared";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PlatformIcon, platformMeta } from "@/components/platform-icon";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { useCategories, type AdminCategory } from "@/lib/hooks/admin";

function Row({ c, onSaved, onDragEnd }: { c: AdminCategory; onSaved: () => void; onDragEnd: () => void }) {
  const controls = useDragControls();
  const toast = useToast();
  const [name, setName] = useState(c.name);
  const patch = useMutation({
    mutationFn: (body: Partial<AdminCategory>) => api(`/admin/categories/${c.id}`, { method: "PATCH", json: body }),
    onSuccess: onSaved,
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't save", "danger"),
  });
  const del = useMutation({
    mutationFn: () => api(`/admin/categories/${c.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("Category deleted");
      onSaved();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't delete", "danger"),
  });

  return (
    <Reorder.Item
      value={c}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.015, boxShadow: "var(--shadow-3)", zIndex: 10 }}
      className="relative flex flex-wrap items-center gap-3 border-b border-line bg-surface px-3 py-2.5 last:border-0 sm:flex-nowrap"
    >
      <button
        onPointerDown={(e) => controls.start(e)}
        aria-label={`Drag to reorder ${c.name}`}
        className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-ink-3 hover:bg-bg-subtle active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <label className="relative shrink-0">
        <span className="sr-only">Platform for {c.name}</span>
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2">
          <PlatformIcon platform={c.platform} className="size-4" />
        </span>
        <select
          value={c.platform}
          onChange={(e) => patch.mutate({ platform: e.target.value })}
          className="h-9 w-36 appearance-none rounded-[9px] border border-line bg-surface pl-8 pr-2 text-[13px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {platformMeta[p]?.label ?? p}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 flex-1">
        <span className="sr-only">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() !== c.name && name.trim().length >= 2 && patch.mutate({ name: name.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-9 w-full rounded-[9px] border border-transparent bg-transparent px-2 text-[14px] font-medium hover:border-line focus:border-accent focus:bg-surface focus:shadow-[var(--ring)] focus:outline-none"
        />
      </label>
      <span className="tabular w-24 shrink-0 text-right text-[13px] text-ink-3">
        {c.activeCount}/{c.serviceCount} visible
      </span>
      <Switch hideLabel label={`${c.name} visible`} checked={c.status === "active"} onChange={(v) => patch.mutate({ status: v ? "active" : "disabled" })} />
      <button
        onClick={() => del.mutate()}
        aria-label={`Delete ${c.name}`}
        disabled={del.isPending}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="size-4" />
      </button>
    </Reorder.Item>
  );
}

export function CategoriesAdmin() {
  const { data, isLoading } = useCategories();
  const qc = useQueryClient();
  const toast = useToast();
  const [order, setOrder] = useState<AdminCategory[]>([]);
  const [newName, setNewName] = useState("");
  useEffect(() => {
    if (data) setOrder(data);
  }, [data]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "categories"] });

  const reorder = useMutation({
    mutationFn: (ids: number[]) => api("/admin/categories/reorder", { method: "POST", json: { ids } }),
    onSuccess: () => toast("Order saved"),
  });
  const create = useMutation({
    mutationFn: (name: string) => api("/admin/categories", { method: "POST", json: { name, platform: "other" } }),
    onSuccess: () => {
      setNewName("");
      refresh();
      toast("Category added");
    },
    onError: (e) => toast(e instanceof ApiError ? (e.fields?.name ?? e.message) : "Couldn't add", "danger"),
  });

  return (
    <>
      <PageHeader title="Categories" description="Drag to change the order customers see. Rename inline; changes save when you leave the field." />
      <form
        className="mb-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim().length >= 2) create.mutate(newName.trim());
        }}
      >
        <label htmlFor="new-category" className="sr-only">
          New category name
        </label>
        <input
          id="new-category"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category, e.g. Instagram Story Views"
          className="h-10 flex-1 rounded-[10px] border border-line bg-surface px-3 text-[14px] shadow-1 focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
        />
        <Button type="submit" loading={create.isPending} disabled={newName.trim().length < 2}>
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      </form>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : order.length === 0 ? (
        <div className="grid place-items-center rounded-[var(--radius-xl)] border border-dashed border-line-strong px-6 py-16 text-center">
          <FolderTree className="size-6 text-ink-3" aria-hidden />
          <p className="mt-3 font-medium">No categories yet</p>
          <p className="mt-1 text-sm text-ink-3">They&apos;re created automatically when you import, or add one above.</p>
        </div>
      ) : (
        <Reorder.Group axis="y" values={order} onReorder={setOrder} className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1">
          {order.map((c) => (
            <Row key={c.id} c={c} onSaved={refresh} onDragEnd={() => reorder.mutate(order.map((o) => o.id))} />
          ))}
        </Reorder.Group>
      )}
    </>
  );
}

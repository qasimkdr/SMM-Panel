"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import type { SettingDef } from "@smm/shared";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

type Values = Record<string, unknown>;

function SettingInput({ def, value, error, onChange }: { def: SettingDef; value: unknown; error?: string; onChange: (v: unknown) => void }) {
  if (def.kind === "boolean") return <Switch checked={Boolean(value)} onChange={onChange} label={def.label} description={error ?? def.help} />;
  if (def.kind === "select")
    return (
      <Select label={def.label} hint={def.help} error={error} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        {def.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  if (def.kind === "textarea")
    return (
      <div className="grid gap-1.5">
        <label htmlFor={def.key} className="text-[13px] font-medium text-ink-2">
          {def.label}
        </label>
        <textarea
          id={def.key}
          rows={def.key === "seo.headCode" ? 5 : 3}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={def.key !== "seo.headCode"}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${def.key}-help`}
          className={cn(
            "rounded-[11px] border bg-surface p-3 text-[14px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none",
            def.key === "seo.headCode" && "font-mono text-[12.5px]",
            error ? "border-danger" : "border-line",
          )}
        />
        <p id={`${def.key}-help`} className={cn("text-[13px]", error ? "text-danger" : "text-ink-3")}>
          {error ?? def.help}
          {def.key === "seo.defaultDescription" && !error && <span className="tabular"> · {String(value ?? "").length} characters</span>}
        </p>
      </div>
    );
  if (def.kind === "color")
    return (
      <div className="grid gap-1.5">
        <label htmlFor={def.key} className="text-[13px] font-medium text-ink-2">
          {def.label}
        </label>
        <div className="flex items-center gap-2">
          <input type="color" aria-label={`${def.label} picker`} value={String(value ?? "#c4461c")} onChange={(e) => onChange(e.target.value)} className="size-10 cursor-pointer rounded-lg border border-line bg-surface p-1" />
          <input
            id={def.key}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 w-32 rounded-[10px] border border-line bg-surface px-3 font-mono text-[14px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
          />
        </div>
        <p className={cn("text-[13px]", error ? "text-danger" : "text-ink-3")}>{error ?? def.help}</p>
      </div>
    );
  return (
    <Field
      label={def.label + (def.kind === "percent" ? " (%)" : "")}
      inputMode={def.kind === "text" ? undefined : "decimal"}
      value={String(value ?? "")}
      onChange={(e) => onChange(def.kind === "number" ? e.target.value.replace(/\D/g, "") : e.target.value)}
      hint={def.help}
      error={error}
    />
  );
}

export function SettingsAdmin() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "settings"], queryFn: () => api<{ registry: SettingDef[]; values: Values }>("/admin/settings") });
  const [draft, setDraft] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data) setDraft(data.values);
  }, [data]);

  const groups = useMemo(() => {
    const m = new Map<string, SettingDef[]>();
    for (const d of data?.registry ?? []) m.set(d.group, [...(m.get(d.group) ?? []), d]);
    return [...m.entries()];
  }, [data]);
  const changed = useMemo(
    () => Object.fromEntries(Object.entries(draft).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(data?.values[k]) && data?.registry.some((d) => d.key === k))),
    [draft, data],
  );
  const dirty = Object.keys(changed).length;

  const save = useMutation({
    mutationFn: () => api<{ saved: number }>("/admin/settings", { method: "PUT", json: { values: changed } }),
    onSuccess: (r) => {
      setErrors({});
      toast(`Saved ${r.saved} setting${r.saved === 1 ? "" : "s"}. The public site updates within a minute.`);
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      toast(e instanceof ApiError ? e.message : "Couldn't save", "danger");
    },
  });

  return (
    <div className="pb-24">
      <PageHeader title="Settings" description="Everything about how the panel behaves. Changes apply right away; nothing here needs a code change." />
      {isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
          <nav aria-label="Settings sections" className="hidden lg:block">
            <ul className="sticky top-24 space-y-0.5">
              {groups.map(([g]) => (
                <li key={g}>
                  <a href={`#set-${g.replace(/\W+/g, "-")}`} className="block rounded-lg px-3 py-2 text-[14px] text-ink-2 hover:bg-bg-subtle hover:text-ink">
                    {g}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="grid gap-5">
            {groups.map(([g, defs]) => (
              <section key={g} id={`set-${g.replace(/\W+/g, "-")}`} className="scroll-mt-24 rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1 sm:p-6">
                <h2 className="text-[15px] font-semibold">{g}</h2>
                <div className="mt-5 grid gap-5">
                  {defs.map((d) => (
                    <SettingInput key={d.key} def={d} value={draft[d.key]} error={errors[d.key]} onChange={(v) => setDraft((x) => ({ ...x, [d.key]: v }))} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {dirty > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 36 }}
            className="fixed inset-x-0 bottom-4 z-40 px-4 lg:left-[256px]"
          >
            <div className="mx-auto flex max-w-xl items-center gap-3 rounded-[var(--radius-xl)] border border-line bg-surface p-2.5 pl-5 shadow-3">
              <p className="flex-1 text-[14px] font-medium">
                {dirty} unsaved change{dirty === 1 ? "" : "s"}
              </p>
              <Button variant="ghost" onClick={() => data && setDraft(data.values)}>
                Discard
              </Button>
              <Button loading={save.isPending} onClick={() => save.mutate()}>
                Save changes
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

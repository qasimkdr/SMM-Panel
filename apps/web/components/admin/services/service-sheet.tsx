"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Percent } from "lucide-react";
import { SERVICE_TYPES } from "@smm/shared";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormAlert } from "@/components/auth/form-alert";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { useCategories, useProviders } from "@/lib/hooks/admin";

export interface AdminService {
  id: number;
  categoryId: number;
  categoryName: string;
  name: string;
  description: string | null;
  type: string;
  mode: "auto" | "manual";
  providerId: number | null;
  providerName: string | null;
  providerServiceId: string | null;
  providerRate: string | null;
  markup: string | null;
  sellRate: string;
  minQty: number;
  maxQty: number;
  refill: boolean;
  refillDays: number;
  cancel: boolean;
  dripfeed: boolean;
  badges: string[] | null;
  status: "active" | "disabled";
  markupSource: "service" | "category" | "provider" | "global" | "manual";
  profit: string | null;
}

export function ServiceSheet({ service, open, onClose }: { service: AdminService | null; open: boolean; onClose: () => void }) {
  const creating = !service;
  const qc = useQueryClient();
  const toast = useToast();
  const categories = useCategories();
  const providers = useProviders();
  const [mode, setMode] = useState<"auto" | "manual">(service?.mode ?? "manual");
  const [flags, setFlags] = useState({
    refill: service?.refill ?? false,
    cancel: service?.cancel ?? false,
    dripfeed: service?.dripfeed ?? false,
    active: (service?.status ?? "active") === "active",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const history = useQuery({
    queryKey: ["admin", "service-history", service?.id],
    queryFn: () => api<{ id: number; field: string; oldValue: string | null; newValue: string | null; source: string; createdAt: string }[]>(`/admin/services/${service!.id}/history`),
    enabled: Boolean(service),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      creating ? api("/admin/services", { method: "POST", json: body }) : api(`/admin/services/${service!.id}`, { method: "PATCH", json: body }),
    onSuccess: () => {
      toast(creating ? "Service created" : "Service saved");
      qc.invalidateQueries({ queryKey: ["admin"] });
      onClose();
    },
    onError: (e) => e instanceof ApiError && e.fields && setErrors(e.fields),
  });

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const s = (k: string) => String(fd.get(k) ?? "").trim();
    const body: Record<string, unknown> = {
      categoryId: Number(s("categoryId")),
      name: s("name"),
      description: s("description") || null,
      minQty: Number(s("minQty")),
      maxQty: Number(s("maxQty")),
      refill: flags.refill,
      refillDays: Number(s("refillDays") || 0),
      cancel: flags.cancel,
      dripfeed: flags.dripfeed,
      badges: s("badges") ? s("badges").split(",").map((b) => b.trim()).filter(Boolean).slice(0, 5) : [],
      status: flags.active ? "active" : "disabled",
    };
    const effectiveMode = creating ? mode : service!.mode;
    if (effectiveMode === "manual") body.sellRate = s("sellRate");
    else body.markup = s("markup") === "" ? null : s("markup");
    if (creating) {
      body.mode = mode;
      body.type = s("type") || "default";
      if (mode === "auto") {
        body.providerId = Number(s("providerId"));
        body.providerServiceId = s("providerServiceId");
      }
    }
    const next: Record<string, string> = {};
    if (!body.name || String(body.name).length < 2) next.name = "Name the service";
    if (!body.categoryId) next.categoryId = "Pick a category";
    if (!(Number(body.minQty) >= 1)) next.minQty = "At least 1";
    if (Number(body.maxQty) < Number(body.minQty)) next.maxQty = "Max must be at least the min";
    if (effectiveMode === "manual" && !/^\d+(\.\d{1,6})?$/.test(String(body.sellRate))) next.sellRate = "Enter a price like 1.25";
    if (Object.keys(next).length) return setErrors(next);
    setErrors({});
    save.mutate(body);
  }

  const auto = (creating ? mode : service!.mode) === "auto";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title={creating ? "New service" : `Service #${service!.id}`}
      description={creating ? "Create your own service, or link one from a provider by its ID." : service!.providerName ? `From ${service!.providerName} · provider ID ${service!.providerServiceId}` : "Manual service (fulfilled by your team)"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="service-form" loading={save.isPending}>
            {creating ? "Create service" : "Save changes"}
          </Button>
        </>
      }
    >
      <form
        id="service-form"
        noValidate
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(e.currentTarget);
        }}
      >
        <FormAlert message={save.error instanceof ApiError && !save.error.fields ? save.error.message : null} />

        {creating && (
          <div role="radiogroup" aria-label="Service source" className="grid grid-cols-2 gap-2 rounded-xl bg-bg-subtle p-1">
            {(["manual", "auto"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`h-9 rounded-lg text-[14px] font-medium transition-[background-color,box-shadow,color] ${mode === m ? "bg-surface text-ink shadow-1" : "text-ink-3 hover:text-ink"}`}
              >
                {m === "manual" ? "My own service" : "From a provider"}
              </button>
            ))}
          </div>
        )}

        <Field name="name" label="Name" defaultValue={service?.name} error={errors.name} autoFocus />
        <Select name="categoryId" label="Category" defaultValue={service?.categoryId ?? ""} error={errors.categoryId}>
          <option value="" disabled>
            Choose a category
          </option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        {creating && (
          <Select name="type" label="Order type" defaultValue="default" hint="Decides which fields customers fill in when ordering.">
            {SERVICE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}
              </option>
            ))}
          </Select>
        )}

        {creating && mode === "auto" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Select name="providerId" label="Provider" defaultValue="">
              <option value="" disabled>
                Choose
              </option>
              {(providers.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Field name="providerServiceId" label="Provider's service ID" error={errors.providerServiceId} />
          </div>
        )}

        <div className="rounded-xl border border-line p-4">
          {auto ? (
            <>
              <div className="flex items-end gap-3">
                <div className="relative">
                  <Field
                    name="markup"
                    label="Commission for this service"
                    inputMode="decimal"
                    defaultValue={service?.markup !== null && service?.markup !== undefined ? String(Number(service.markup)) : ""}
                    placeholder="Inherit"
                    className="w-44"
                    error={errors.markup}
                  />
                  <Percent className="pointer-events-none absolute bottom-3.5 right-3 size-3.5 text-ink-3" aria-hidden />
                </div>
              </div>
              {service && (
                <dl className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
                  <div>
                    <dt className="text-ink-3">Cost / 1k</dt>
                    <dd className="tabular mt-0.5 font-mono">${Number(service.providerRate ?? 0).toFixed(4)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Price / 1k</dt>
                    <dd className="tabular mt-0.5 font-mono font-semibold">${Number(service.sellRate).toFixed(4)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Profit / 1k</dt>
                    <dd className="tabular mt-0.5 font-mono text-success">${Number(service.profit ?? 0).toFixed(4)}</dd>
                  </div>
                </dl>
              )}
              <p className="mt-3 text-[13px] text-ink-3">Leave empty to use the {service?.markupSource === "service" ? "category, provider or global" : (service?.markupSource ?? "category, provider or global")} commission.</p>
            </>
          ) : (
            <Field name="sellRate" label="Price per 1,000 (USD)" inputMode="decimal" defaultValue={service ? String(Number(service.sellRate)) : ""} error={errors.sellRate} placeholder="e.g. 2.50" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field name="minQty" label="Min order" inputMode="numeric" defaultValue={service?.minQty ?? 10} error={errors.minQty} />
          <Field name="maxQty" label="Max order" inputMode="numeric" defaultValue={service?.maxQty ?? 10000} error={errors.maxQty} />
        </div>

        <div className="grid gap-4 rounded-xl border border-line p-4">
          <Switch checked={flags.active} onChange={(v) => setFlags((f) => ({ ...f, active: v }))} label="Visible to customers" />
          <Switch checked={flags.refill} onChange={(v) => setFlags((f) => ({ ...f, refill: v }))} label="Refill guarantee" description="Shows a Refill button on completed orders." />
          {flags.refill && <Field name="refillDays" label="Refill period (days)" inputMode="numeric" defaultValue={service?.refillDays || 30} className="w-44" />}
          <Switch checked={flags.cancel} onChange={(v) => setFlags((f) => ({ ...f, cancel: v }))} label="Customers can cancel" />
          <Switch checked={flags.dripfeed} onChange={(v) => setFlags((f) => ({ ...f, dripfeed: v }))} label="Drip-feed allowed" description="Deliver in runs over time." />
        </div>

        <Field name="badges" label="Badges" defaultValue={(service?.badges ?? []).join(", ")} placeholder="Best seller, Fast" hint="Comma-separated, up to 5. Shown on the services list." />
        <div className="grid gap-1.5">
          <label htmlFor="description" className="text-[13px] font-medium text-ink-2">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={service?.description ?? ""}
            placeholder="Start time, speed, quality, refill details…"
            className="rounded-[10px] border border-line bg-surface p-3 text-[14px] leading-relaxed focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
          />
        </div>

        {service && (
          <section>
            <h3 className="flex items-center gap-2 text-[14px] font-semibold">
              <History className="size-4 text-ink-3" aria-hidden /> Price history
            </h3>
            {history.data?.length ? (
              <ul className="mt-3 divide-y divide-line rounded-xl border border-line text-[13px]">
                {history.data.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-ink-3">
                      {new Date(h.createdAt).toLocaleDateString()} · {h.field.replace("_", " ")} · {h.source}
                    </span>
                    <span className="tabular font-mono">
                      {h.oldValue ?? "—"} → {h.newValue ?? "inherit"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-ink-3">No changes yet.</p>
            )}
          </section>
        )}
      </form>
    </Dialog>
  );
}

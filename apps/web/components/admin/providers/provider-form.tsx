"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { providerInputSchema } from "@smm/shared";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormAlert } from "@/components/auth/form-alert";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import type { AdminProvider } from "@/lib/hooks/admin";

const CUSTOM_EXAMPLE = `{
  "bodyType": "json",
  "auth": { "in": "header", "name": "Authorization", "prefix": "Bearer " },
  "actions": { "services": "get_services" },
  "responseFields": { "service": "id", "rate": "price" },
  "servicesPath": "data"
}`;

export function ProviderForm({ open, onClose, provider }: { open: boolean; onClose: () => void; provider?: AdminProvider | null }) {
  const qc = useQueryClient();
  const toast = useToast();
  const editing = Boolean(provider);
  const [driver, setDriver] = useState<"v2" | "custom">(provider?.driver ?? "v2");
  const [syncEnabled, setSyncEnabled] = useState(provider?.syncEnabled ?? true);
  const [advanced, setAdvanced] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (body: unknown) =>
      editing ? api(`/admin/providers/${provider!.id}`, { method: "PATCH", json: body }) : api<AdminProvider>("/admin/providers", { method: "POST", json: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "providers"] });
      toast(editing ? "Provider saved" : "Provider added. Test the connection, then import services.");
      onClose();
    },
    onError: (e) => e instanceof ApiError && e.fields && setErrors(e.fields),
  });

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    let driverConfig: unknown = null;
    if (driver === "custom") {
      try {
        driverConfig = JSON.parse(String(fd.get("driverConfig") || "{}"));
      } catch {
        setErrors({ driverConfig: "This isn't valid JSON. Check commas and quotes." });
        return;
      }
    }
    const body = {
      name: fd.get("name"),
      apiUrl: fd.get("apiUrl"),
      apiKey: String(fd.get("apiKey") || "") || undefined,
      driver,
      driverConfig,
      syncEnabled,
      syncIntervalMin: Number(fd.get("syncIntervalMin")),
    };
    const schema = editing ? providerInputSchema.partial() : providerInputSchema;
    const r = schema.safeParse(body);
    if (!r.success) {
      const next: Record<string, string> = {};
      for (const i of r.error.issues) next[i.path.join(".")] ??= i.message;
      setErrors(next);
      return;
    }
    if (!editing && !body.apiKey) {
      setErrors({ apiKey: "Paste the API key from the provider's account page" });
      return;
    }
    setErrors({});
    save.mutate(body);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${provider!.name}` : "Add provider"}
      description="Any panel that offers an API. Most use the standard v2 format."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="provider-form" loading={save.isPending}>
            {editing ? "Save changes" : "Add provider"}
          </Button>
        </>
      }
    >
      <form
        id="provider-form"
        noValidate
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(e.currentTarget);
        }}
      >
        <FormAlert message={save.error instanceof ApiError && !save.error.fields ? save.error.message : null} />
        <Field name="name" label="Name" defaultValue={provider?.name} placeholder="e.g. MainProvider" error={errors.name} autoFocus />
        <Field name="apiUrl" label="API URL" type="url" defaultValue={provider?.apiUrl} placeholder="https://provider.com/api/v2" error={errors.apiUrl} />
        <Field
          name="apiKey"
          label="API key"
          type="password"
          autoComplete="off"
          placeholder={editing ? `Saved (${provider!.keyHint}). Leave empty to keep it.` : "Paste the key"}
          error={errors.apiKey}
          hint="Stored encrypted. Only the last 4 characters are ever shown."
        />
        <Select label="API format" value={driver} onChange={(e) => setDriver(e.target.value as "v2" | "custom")}>
          <option value="v2">Standard API v2 (most panels)</option>
          <option value="custom">Custom / v3 (different field names or auth)</option>
        </Select>
        {driver === "custom" && (
          <div className="grid gap-1.5">
            <label htmlFor="driverConfig" className="text-[13px] font-medium text-ink-2">
              Custom settings (JSON)
            </label>
            <textarea
              id="driverConfig"
              name="driverConfig"
              rows={8}
              spellCheck={false}
              defaultValue={provider?.driverConfig ? JSON.stringify(provider.driverConfig, null, 2) : CUSTOM_EXAMPLE}
              aria-invalid={errors.driverConfig ? true : undefined}
              className="rounded-[10px] border border-line bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
            />
            <p className={errors.driverConfig ? "text-[13px] text-danger" : "text-[13px] text-ink-3"}>
              {errors.driverConfig ?? "Only list what differs from v2: auth location, action names, field names, wrapped list path."}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setAdvanced((a) => !a)}
          aria-expanded={advanced}
          className="flex items-center gap-1.5 justify-self-start text-[13px] font-medium text-ink-2 hover:text-ink"
        >
          <ChevronDown className={`size-4 transition-transform ${advanced ? "rotate-180" : ""}`} aria-hidden /> Sync settings
        </button>
        {advanced && (
          <div className="grid gap-4 rounded-xl border border-line p-4">
            <Switch checked={syncEnabled} onChange={setSyncEnabled} label="Automatic sync" description="Update prices and limits, and hide services the provider removes." />
            <Select name="syncIntervalMin" label="Sync every" defaultValue={String(provider?.syncIntervalMin ?? 180)}>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="180">3 hours</option>
              <option value="360">6 hours</option>
              <option value="720">12 hours</option>
              <option value="1440">24 hours</option>
            </Select>
          </div>
        )}
        {!advanced && <input type="hidden" name="syncIntervalMin" value={String(provider?.syncIntervalMin ?? 180)} />}
      </form>
    </Dialog>
  );
}

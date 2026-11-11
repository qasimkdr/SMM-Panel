"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Eye, EyeOff, KeyRound, UserRound } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/auth/form-alert";
import { api, ApiError } from "@/lib/api";
import { useCurrencies, useMe } from "@/lib/hooks/queries";

export default function AccountPage() {
  const { data: me } = useMe();
  const { data: currencies } = useCurrencies();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const key = useQuery({ queryKey: ["api-key"], queryFn: () => api<{ apiKey: string }>("/me/api-key"), enabled: showKey });

  const save = useMutation({
    mutationFn: (body: { name?: string; currency?: string }) => api("/me", { method: "PATCH", json: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["catalog"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  return (
    <>
      <PageHeader title="Account" description="Profile, display currency and API access." />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 shadow-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <UserRound className="size-4 text-ink-3" aria-hidden /> Profile
          </h2>
          {!me ? (
            <Skeleton className="mt-5 h-40 w-full" />
          ) : (
            <form
              className="mt-5 grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                save.mutate({ name: String(fd.get("name") ?? ""), currency: String(fd.get("currency")) });
              }}
            >
              <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[14px]">
                <dt className="text-ink-3">Username</dt>
                <dd>{me.username}</dd>
                <dt className="text-ink-3">Email</dt>
                <dd className="truncate">{me.email}</dd>
              </dl>
              <div className="grid gap-1.5">
                <label htmlFor="name" className="text-[13px] font-medium text-ink-2">
                  Display name
                </label>
                <input
                  id="name"
                  name="name"
                  defaultValue={me.name ?? ""}
                  maxLength={80}
                  className="h-11 rounded-[11px] border border-line bg-surface px-3.5 text-[15px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="currency" className="text-[13px] font-medium text-ink-2">
                  Display currency
                </label>
                <select
                  id="currency"
                  name="currency"
                  defaultValue={me.currency}
                  className="h-11 rounded-[11px] border border-line bg-surface px-3 text-[15px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
                >
                  {(currencies ?? []).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
                <p className="text-[13px] text-ink-3">Balances are kept in USD and shown in this currency.</p>
              </div>
              <FormAlert message={save.error instanceof ApiError ? save.error.message : null} />
              <Button type="submit" loading={save.isPending} className="justify-self-start">
                {saved ? (
                  <>
                    <Check className="size-4" /> Saved
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </form>
          )}
        </section>

        <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 shadow-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <KeyRound className="size-4 text-ink-3" aria-hidden /> API key
          </h2>
          <p className="mt-2 text-[14px] text-ink-3">Use this key with the API v2 endpoint. Keep it private: anyone with it can place orders on your balance.</p>
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-1.5 pl-3.5">
            <code className="flex-1 truncate font-mono text-[13px]">
              {showKey ? (key.data?.apiKey ?? "Loading…") : "••••••••••••••••••••••••••••••••"}
            </code>
            <Button variant="ghost" size="sm" onClick={() => setShowKey((s) => !s)} aria-label={showKey ? "Hide key" : "Show key"}>
              {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!key.data}
              onClick={async () => {
                if (!key.data) return;
                await navigator.clipboard.writeText(key.data.apiKey);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

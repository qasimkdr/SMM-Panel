"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Ban, CheckCircle2, Clock, Droplets, Info, MailWarning, RotateCcw, Search, Wallet } from "lucide-react";
import { ORDER_FIELDS, normalizeOrder, orderCharge, type OrderInput, type ServiceType } from "@smm/shared";
import { Button, buttonClass } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TiltCard } from "@/components/ui/tilt-card";
import { Badge } from "@/components/ui/badge";
import { FormAlert } from "@/components/auth/form-alert";
import { PlatformIcon, platformMeta } from "@/components/platform-icon";
import { Skeleton } from "@/components/dashboard/page-header";
import { api, ApiError } from "@/lib/api";
import { formatDuration, formatMoney } from "@/lib/format";
import { useCatalog, useCurrency, useMe } from "@/lib/hooks/queries";
import { cn } from "@/lib/cn";

type Values = Record<string, string>;

export function NewOrderForm() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const { data: catalog, isLoading } = useCatalog();
  const { data: me } = useMe();
  const currency = useCurrency();

  const [platform, setPlatform] = useState("all");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [values, setValues] = useState<Values>({});
  const [drip, setDrip] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [placed, setPlaced] = useState<{ order: number; charge: string } | null>(null);
  const idemKey = useRef<string>("");

  const all = useMemo(() => (catalog ?? []).flatMap((c) => c.services.map((s) => ({ ...s, category: c }))), [catalog]);
  const platforms = useMemo(() => [...new Set((catalog ?? []).map((c) => c.platform))], [catalog]);
  const categories = useMemo(() => (catalog ?? []).filter((c) => platform === "all" || c.platform === platform), [catalog, platform]);
  const category = categories.find((c) => c.id === categoryId) ?? null;
  const service = all.find((s) => s.id === serviceId) ?? null;
  const type = (service?.type ?? "default") as ServiceType;
  const fields = ORDER_FIELDS[type] ?? ORDER_FIELDS.default;
  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return all.filter((s) => s.name.toLowerCase().includes(q) || String(s.id) === q).slice(0, 8);
  }, [all, search]);

  // Deep link: /dashboard/new-order?service=123
  useEffect(() => {
    const id = Number(params.get("service"));
    if (!id || !all.length) return;
    const s = all.find((x) => x.id === id);
    if (s) pick(s.id, s.category.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all.length]);

  function pick(sid: number, cid: number) {
    setCategoryId(cid);
    setServiceId(sid);
    setErrors({});
    setDrip(false);
    setSearch("");
  }

  // Display-only estimate from server-computed rates; the API calculates the real charge.
  const input: OrderInput = useMemo(
    () => ({
      service: serviceId ?? 0,
      ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== "")),
      ...(drip ? { runs: Number(values.runs) || undefined, interval: Number(values.interval) || undefined } : { runs: undefined, interval: undefined }),
    }) as OrderInput,
    [serviceId, values, drip],
  );
  const check = service ? normalizeOrder(input, { type, minQty: service.min, maxQty: service.max, dripfeed: service.dripfeed }) : null;
  const units = check?.ok ? check.order.totalQuantity : Number(values.quantity || 0) * (drip ? Number(values.runs || 1) : 1);
  const estimate = service && units > 0 ? orderCharge(type, service.rate, units) : null;
  const after = me && estimate ? Number(me.balance) - Number(estimate) : null;

  const place = useMutation({
    mutationFn: (body: OrderInput) =>
      api<{ order: number; charge: string }>("/orders", { method: "POST", json: body, headers: { "Idempotency-Key": idemKey.current } }),
    onSuccess: (r) => {
      setPlaced(r);
      setValues({});
      setDrip(false);
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      idemKey.current = ""; // allow a fresh attempt after an error
    },
  });

  function submit() {
    if (!service || !check) return setErrors({ service: "Pick a service" });
    if (!check.ok) return setErrors(check.errors);
    setErrors({});
    idemKey.current ||= crypto.randomUUID(); // double-clicks reuse the key → one order
    place.mutate(input);
  }

  const set = (k: string) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));

  if (isLoading) return <Skeleton className="h-[480px] w-full" />;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1.35fr_1fr]">
      <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1 sm:p-6">
        {me && !me.emailVerified && (
          <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-warning-soft px-3.5 py-3 text-[14px] text-warning">
            <MailWarning className="mt-0.5 size-4 shrink-0" aria-hidden /> Confirm your email to place orders. The link is in your inbox.
          </div>
        )}

        <div className="relative">
          <label htmlFor="svc-search" className="sr-only">
            Search services
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            id="svc-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services by name or ID"
            autoComplete="off"
            className="h-11 w-full rounded-[11px] border border-line bg-surface pl-10 pr-3 text-[15px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
          />
          <AnimatePresence>
            {searchHits.length > 0 && (
              <motion.ul
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute inset-x-0 top-12 z-20 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-3"
                role="listbox"
                aria-label="Matching services"
              >
                {searchHits.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => pick(s.id, s.category.id)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14px] hover:bg-bg-subtle"
                    >
                      <PlatformIcon platform={s.category.platform} className="size-4 shrink-0 text-ink-3" />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="tabular shrink-0 font-mono text-[12.5px] text-ink-3">{formatMoney(s.rate, currency, { rate: true })}</span>
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Platform">
          {["all", ...platforms].map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={platform === p}
              onClick={() => {
                setPlatform(p);
                setCategoryId(null);
                setServiceId(null);
              }}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-[background-color,color,border-color,transform] duration-200 active:scale-[0.97]",
                platform === p ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink-2 hover:border-line-strong",
              )}
            >
              {p !== "all" && <PlatformIcon platform={p} className="size-3.5" />}
              {p === "all" ? "All" : (platformMeta[p]?.label ?? p)}
            </button>
          ))}
        </div>

        <form
          noValidate
          className="mt-5 grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Select
            label="Category"
            value={categoryId ?? ""}
            onChange={(e) => {
              setCategoryId(Number(e.target.value));
              setServiceId(null);
            }}
          >
            <option value="" disabled>
              Choose a category
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            label="Service"
            value={serviceId ?? ""}
            disabled={!category}
            error={errors.service}
            onChange={(e) => {
              setServiceId(Number(e.target.value));
              setErrors({});
              setDrip(false);
            }}
          >
            <option value="" disabled>
              {category ? "Choose a service" : "Choose a category first"}
            </option>
            {category?.services.map((s) => (
              <option key={s.id} value={s.id}>
                #{s.id} · {s.name} — {formatMoney(s.rate, currency, { rate: true })} / 1k
              </option>
            ))}
          </Select>

          <AnimatePresence mode="wait">
            {service && (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="grid gap-4"
              >
                {fields.map((f) =>
                  f.kind === "textarea" ? (
                    <div key={f.name} className="grid gap-1.5">
                      <label htmlFor={`f-${f.name}`} className="text-[13px] font-medium text-ink-2">
                        {f.label}
                        {f.optional && <span className="font-normal text-ink-3"> (optional)</span>}
                      </label>
                      <textarea
                        id={`f-${f.name}`}
                        rows={5}
                        value={values[f.name] ?? ""}
                        onChange={set(f.name)}
                        placeholder={f.placeholder}
                        aria-invalid={errors[f.name] ? true : undefined}
                        aria-describedby={`f-${f.name}-help`}
                        className={cn(
                          "rounded-[11px] border bg-surface p-3 text-[14px] leading-relaxed focus:border-accent focus:shadow-[var(--ring)] focus:outline-none",
                          errors[f.name] ? "border-danger" : "border-line",
                        )}
                      />
                      <p id={`f-${f.name}-help`} className={cn("text-[13px]", errors[f.name] ? "text-danger" : "text-ink-3")}>
                        {errors[f.name] ?? f.hint}
                      </p>
                    </div>
                  ) : (
                    <Field
                      key={f.name}
                      label={f.label + (f.optional ? " (optional)" : "")}
                      inputMode={f.kind === "number" ? "numeric" : f.name === "link" ? "url" : undefined}
                      value={values[f.name] ?? ""}
                      onChange={set(f.name)}
                      placeholder={f.name === "quantity" ? `${service.min.toLocaleString()} – ${service.max.toLocaleString()}` : f.placeholder}
                      hint={f.name === "quantity" ? `Min ${service.min.toLocaleString()}, max ${service.max.toLocaleString()}` : f.hint}
                      error={errors[f.name]}
                      autoComplete="off"
                    />
                  ),
                )}

                {service.dripfeed && (
                  <div className="grid gap-4 rounded-xl border border-line p-4">
                    <Switch checked={drip} onChange={setDrip} label="Drip-feed" description="Deliver in several runs instead of all at once. You pay for quantity × runs." />
                    {drip && (
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Runs" inputMode="numeric" value={values.runs ?? ""} onChange={set("runs")} placeholder="e.g. 5" error={errors.runs} />
                        <Field label="Interval (minutes)" inputMode="numeric" value={values.interval ?? ""} onChange={set("interval")} placeholder="e.g. 30" error={errors.interval} />
                      </div>
                    )}
                  </div>
                )}

                <FormAlert message={place.error instanceof ApiError && !place.error.fields ? place.error.message : null} />
                <Button type="submit" size="lg" loading={place.isPending} disabled={!me?.emailVerified} className="w-full">
                  Place order{estimate ? ` · ${formatMoney(estimate, currency)}` : ""}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </section>

      <aside className="lg:sticky lg:top-24">
        <AnimatePresence mode="wait">
          {placed ? (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <TiltCard className="p-6 text-center">
                <CheckCircle2 className="depth-2 mx-auto size-10 text-success" aria-hidden />
                <h2 className="mt-3 text-[18px] font-semibold">Order #{placed.order} placed</h2>
                <p className="mt-1 text-[14px] text-ink-3" role="status">
                  Charged {formatMoney(placed.charge, currency)}. You can follow it live on the orders page.
                </p>
                <div className="mt-5 flex justify-center gap-2">
                  <Link href="/dashboard/orders" className={buttonClass("primary", "md")}>
                    View orders
                  </Link>
                  <Button variant="secondary" onClick={() => setPlaced(null)}>
                    Place another
                  </Button>
                </div>
              </TiltCard>
            </motion.div>
          ) : (
            <motion.div key="summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <TiltCard max={4} className="p-6">
                {!service ? (
                  <div className="py-6 text-center">
                    <Info className="mx-auto size-6 text-ink-3" aria-hidden />
                    <p className="mt-3 font-medium">Pick a service</p>
                    <p className="mt-1 text-[14px] text-ink-3">Its price, limits and delivery details show up here.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                        <PlatformIcon platform={service.category.platform} className="size-[18px]" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-mono text-[12px] text-ink-3">#{service.id}</p>
                        <h2 className="text-[15px] font-semibold leading-snug">{service.name}</h2>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {service.refill && (
                        <Badge tone="success">
                          <RotateCcw className="size-3" aria-hidden /> Refill {service.refillDays ? `${service.refillDays}d` : ""}
                        </Badge>
                      )}
                      {service.cancel && (
                        <Badge>
                          <Ban className="size-3" aria-hidden /> Cancel
                        </Badge>
                      )}
                      {service.dripfeed && (
                        <Badge tone="info">
                          <Droplets className="size-3" aria-hidden /> Drip-feed
                        </Badge>
                      )}
                      {service.avgTimeSec && (
                        <Badge>
                          <Clock className="size-3" aria-hidden /> ~{formatDuration(service.avgTimeSec)}
                        </Badge>
                      )}
                    </div>
                    {service.description && <p className="mt-4 whitespace-pre-line text-[14px] leading-relaxed text-ink-2">{service.description}</p>}
                    <dl className="depth-1 mt-5 space-y-2.5 border-t border-line pt-4 text-[14px]">
                      <div className="flex justify-between">
                        <dt className="text-ink-3">Price per 1,000</dt>
                        <dd className="tabular font-medium">{formatMoney(service.rate, currency, { rate: true })}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-ink-3">Quantity</dt>
                        <dd className="tabular">{units > 0 ? units.toLocaleString() : "—"}</dd>
                      </div>
                      <div className="flex justify-between border-t border-dashed border-line pt-2.5 text-[16px]">
                        <dt className="font-medium">Total</dt>
                        <dd className="tabular font-semibold">{estimate ? formatMoney(estimate, currency) : "—"}</dd>
                      </div>
                      {after !== null && (
                        <div className={cn("flex justify-between text-[13px]", after < 0 ? "text-danger" : "text-ink-3")}>
                          <dt className="flex items-center gap-1.5">
                            <Wallet className="size-3.5" aria-hidden /> Balance after
                          </dt>
                          <dd className="tabular">{after < 0 ? "Not enough balance" : formatMoney(after.toFixed(6), currency)}</dd>
                        </div>
                      )}
                    </dl>
                  </>
                )}
              </TiltCard>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </div>
  );
}

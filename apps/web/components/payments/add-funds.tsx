"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, CheckCircle2, Clock, Copy, ImagePlus, Wallet, X } from "lucide-react";
import { TiltCard } from "@/components/ui/tilt-card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/ui/reveal";
import { Skeleton } from "@/components/dashboard/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useCurrency } from "@/lib/hooks/queries";
import { cn } from "@/lib/cn";
import { BrandMark } from "./brand-mark";
import { WhatsAppCard } from "./whatsapp";

interface Method {
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
  rate: string | null;
}
interface Deposit {
  id: number;
  method: string | null;
  brand: string | null;
  amount: string;
  amountLocal: string | null;
  currency: string;
  txnId: string | null;
  status: "pending" | "completed" | "rejected" | "failed" | "refunded";
  adminNote: string | null;
  createdAt: string;
}

const MAX_SIDE = 1600;

/** Shrinks a phone screenshot (often 3–8 MB) to a ~300 KB JPEG before upload. Falls back to the original file. */
async function compressImage(file: File): Promise<Blob> {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (blob && blob.size < file.size) return blob;
  } catch {}
  return file;
}

function labels(m: Method) {
  const binance = m.kind === "binance_pay";
  return {
    account: binance ? "Binance Pay ID" : m.brand === "raast" ? "Raast ID" : "Account number",
    txn: binance ? "Order ID" : "Transaction ID (TID)",
    txnHint: binance ? "In Binance: Pay → History → tap the payment → Order ID." : "Shown on the confirmation screen and in the SMS you get after paying.",
    unit: binance ? "USDT" : m.currency,
  };
}

const fmtLocal = (v: string, cur: string) => `${cur === "USD" ? "$" : `${cur} `}${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function AddFunds() {
  const methods = useQuery({ queryKey: ["payment-methods"], queryFn: () => api<{ enabled: boolean; methods: Method[] }>("/payments/methods"), staleTime: 60_000 });
  const list = methods.data?.methods ?? [];

  if (methods.isLoading) return <Skeleton className="h-[480px]" />;
  if (!methods.data?.enabled || list.length === 0) return <ComingSoon />;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <DepositForm methods={list} />
      <div className="grid gap-6 lg:sticky lg:top-24">
        <WhatsAppCard />
        <History />
      </div>
    </div>
  );
}

function ComingSoon() {
  return (
    <div className="grid gap-6">
      <TiltCard max={4} className="mx-auto w-full max-w-xl overflow-hidden p-8 text-center sm:p-12">
        <div className="depth-2 mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent shadow-2">
          <Wallet className="size-6" aria-hidden />
        </div>
        <h2 className="mt-6 text-[22px] font-semibold tracking-[-0.02em]">Online payments are on the way</h2>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-ink-3">Until then, our team can add balance to your account for you.</p>
      </TiltCard>
      <WhatsAppCard className="mx-auto w-full max-w-xl" />
    </div>
  );
}

function Step({ n, title, children, className }: { n: number; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={`step-${n}`} className={className}>
      <h2 id={`step-${n}`} className="flex items-center gap-3 text-[15px] font-semibold">
        <span className="grid size-7 place-items-center rounded-full border border-line-strong bg-surface font-mono text-[12px] text-ink-2 shadow-1">{n}</span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DepositForm({ methods }: { methods: Method[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const currency = useCurrency();
  const reduce = useReducedMotion();
  const [methodId, setMethodId] = useState(methods[0]!.id);
  const method = methods.find((m) => m.id === methodId) ?? methods[0]!;
  const l = labels(method);
  const [amount, setAmount] = useState("");
  const [txnId, setTxnId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const usd = useMemo(() => {
    const a = Number(amount);
    const rate = Number(method.rate ?? 0);
    return a > 0 && rate > 0 ? a / rate : null;
  }, [amount, method.rate]);

  const submit = useMutation({
    mutationFn: async () => {
      let proofId: number | undefined;
      if (file) {
        const blob = await compressImage(file);
        const type = blob.type || file.type;
        const r = await api<{ proofId: number }>("/payments/proof", { method: "POST", body: blob, headers: { "Content-Type": type } });
        proofId = r.proofId;
      }
      return api<{ id: number; status: "pending" | "completed"; amount: string }>("/payments", { method: "POST", json: { methodId: method.id, amount, txnId, proofId } });
    },
    onSuccess: () => {
      setAmount("");
      setTxnId("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["deposits"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
  const err = submit.error instanceof ApiError ? submit.error : null;
  const fe = err?.fields ?? {};

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(method.accountNumber ?? "");
      toast("Copied");
    } catch {
      toast("Couldn't copy. Select the number and copy it.", "danger");
    }
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-2 sm:p-7">
      <Step n={1} title="Choose how to pay">
        <Stagger gap={0.05} role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {methods.map((m) => (
            <StaggerItem key={m.id}>
              <label
                className={cn(
                  "method-tile relative flex h-full cursor-pointer items-center gap-3 rounded-[14px] border bg-surface p-3 shadow-1",
                  "has-[:focus-visible]:shadow-[var(--ring)]",
                  m.id === method.id ? "border-accent bg-accent-soft/40" : "border-line hover:border-line-strong",
                )}
                data-selected={m.id === method.id}
              >
                <input type="radio" name="method" value={m.id} checked={m.id === method.id} onChange={() => setMethodId(m.id)} className="sr-only" />
                <BrandMark brand={m.brand} name={m.name} className="method-mark" />
                <span className="min-w-0 pr-4">
                  <span className="block truncate text-[14px] font-medium">{m.name}</span>
                  <span className="block font-mono text-[11px] text-ink-3">{labels(m).unit}</span>
                </span>
                {m.id === method.id && (
                  <motion.span layoutId={reduce ? undefined : "method-check"} className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-accent text-accent-ink">
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </motion.span>
                )}
              </label>
            </StaggerItem>
          ))}
        </Stagger>
      </Step>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={method.id}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <Step n={2} title={`Send money with ${method.name}`} className="mt-8">
            <div className="account-slab relative overflow-hidden rounded-[16px] border border-line bg-bg-subtle p-4 sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">{l.account}</p>
                  <p className="mt-1 break-all font-mono text-[22px] font-semibold tracking-[0.02em] tabular-nums sm:text-[26px]">{method.accountNumber || "—"}</p>
                  {method.accountTitle && (
                    <p className="mt-1 text-[14px] text-ink-2">
                      Account title: <span className="font-medium text-ink">{method.accountTitle}</span>
                    </p>
                  )}
                </div>
                {method.accountNumber && (
                  <Button type="button" variant="secondary" size="sm" onClick={copy}>
                    <Copy className="size-3.5" aria-hidden /> Copy
                  </Button>
                )}
              </div>
              {method.instructions && <p className="mt-4 border-t border-line pt-3 text-[14px] leading-relaxed text-ink-2">{method.instructions}</p>}
            </div>
          </Step>
        </motion.div>
      </AnimatePresence>

      <Step n={3} title="Tell us what you sent" className="mt-8">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={`Amount sent (${l.unit})`}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder={`Min ${Number(method.minAmount).toLocaleString("en-US")}`}
              error={fe.amount}
              hint={
                usd !== null ? (
                  <>
                    About <span className="font-medium text-ink">{formatMoney(usd, currency)}</span> will be added
                  </>
                ) : (
                  `Minimum ${fmtLocal(method.minAmount, l.unit === "USDT" ? "USD" : method.currency)}${method.maxAmount ? `, maximum ${fmtLocal(method.maxAmount, l.unit === "USDT" ? "USD" : method.currency)}` : ""}`
                )
              }
              required
            />
            <Field label={l.txn} value={txnId} onChange={(e) => setTxnId(e.target.value)} autoComplete="off" spellCheck={false} className="[&_input]:font-mono" error={fe.txnId} hint={l.txnHint} required />
          </div>

          <div className="grid gap-1.5">
            <span id="proof-label" className="text-[13px] font-medium text-ink-2">
              Screenshot of the receipt{method.kind === "binance_pay" && <span className="font-normal text-ink-3"> (optional)</span>}
            </span>
            <input
              ref={fileRef}
              id="proof"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-labelledby="proof-label"
              aria-describedby={fe.proof ? "proof-error" : undefined}
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {preview ? (
              <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface p-2.5 shadow-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Selected receipt" className="size-16 rounded-lg object-cover" />
                <span className="min-w-0 flex-1 truncate text-[14px]">{file?.name}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>
                  <X className="size-4" aria-hidden /> Remove
                </Button>
              </div>
            ) : (
              <label
                htmlFor="proof"
                className={cn(
                  "drop-zone flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[14px] border border-dashed bg-surface px-4 py-6 text-center",
                  "has-[+input:focus-visible]:shadow-[var(--ring)]",
                  fe.proof ? "border-danger" : "border-line-strong hover:border-accent",
                )}
              >
                <ImagePlus className="drop-icon size-6 text-ink-3" aria-hidden />
                <span className="text-[14px] font-medium">Choose a screenshot</span>
                <span className="text-[12px] text-ink-3">JPG, PNG or WebP</span>
              </label>
            )}
            {fe.proof && (
              <p id="proof-error" className="text-[13px] text-danger">
                {fe.proof}
              </p>
            )}
          </div>

          <FormAlert message={err && !err.fields ? err.message : null} />
          <AnimatePresence>
            {submit.data && (
              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                role="status"
                className="flex items-start gap-3 rounded-[14px] bg-success-soft px-4 py-3.5 text-success"
              >
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
                <span className="text-[14px]">
                  {submit.data.status === "completed" ? (
                    <>
                      <strong>{formatMoney(submit.data.amount, currency)}</strong> was added to your balance.
                    </>
                  ) : (
                    <>Thanks! We&apos;re checking your payment. Your balance updates as soon as it&apos;s confirmed, and you&apos;ll get a notification.</>
                  )}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <Button type="submit" size="lg" loading={submit.isPending} disabled={!amount || !txnId.trim()} className="sm:justify-self-start">
            Submit payment
          </Button>
        </form>
      </Step>
    </div>
  );
}

const STATUS: Record<Deposit["status"], { tone: "warning" | "success" | "danger" | "neutral"; label: string }> = {
  pending: { tone: "warning", label: "Checking" },
  completed: { tone: "success", label: "Added" },
  rejected: { tone: "danger", label: "Not confirmed" },
  failed: { tone: "danger", label: "Failed" },
  refunded: { tone: "neutral", label: "Refunded" },
};

function History() {
  const currency = useCurrency();
  const q = useInfiniteQuery({
    queryKey: ["deposits"],
    queryFn: ({ pageParam }) => api<{ items: Deposit[]; nextCursor: number | null }>(`/payments${pageParam ? `?cursor=${pageParam}` : ""}`),
    initialPageParam: 0,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    staleTime: 15_000,
    refetchInterval: (query) => (query.state.data?.pages[0]?.items.some((d) => d.status === "pending") ? 30_000 : false),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section aria-labelledby="deposits-title" className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1">
      <h2 id="deposits-title" className="text-[15px] font-semibold">
        Your deposits
      </h2>
      {q.isLoading ? (
        <Skeleton className="mt-4 h-24" />
      ) : items.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-[14px] text-ink-3">
          <Clock className="size-4" aria-hidden /> Deposits you submit will show here.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          <AnimatePresence initial={false}>
            {items.map((d) => (
              <motion.li key={d.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-3">
                <div className="flex items-center gap-3">
                  <BrandMark brand={d.brand ?? "other"} name={d.method ?? "?"} className="size-8 rounded-lg text-[11px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">
                      {d.amountLocal ? fmtLocal(d.amountLocal, d.currency) : formatMoney(d.amount, currency)}
                      <span className="font-normal text-ink-3"> · {d.method ?? "Deposit"}</span>
                    </p>
                    <p className="text-[12px] text-ink-3">
                      {new Date(d.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      {d.status === "completed" && ` · ${formatMoney(d.amount, currency)} added`}
                    </p>
                  </div>
                  <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                </div>
                {d.status === "rejected" && d.adminNote && <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{d.adminNote}</p>}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {q.hasNextPage && (
        <Button variant="ghost" size="sm" className="mt-2 w-full" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          Show older
        </Button>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Gift, MousePointerClick, UserPlus, Wallet } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/input";
import { TiltCard } from "@/components/ui/tilt-card";
import { Stagger, StaggerItem } from "@/components/ui/reveal";
import { FormAlert } from "@/components/auth/form-alert";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useCurrency } from "@/lib/hooks/queries";

interface AffiliateData {
  code: string;
  balance: string;
  visits: number;
  signups: number;
  earned: string;
  commissionPercent: string;
  minPayout: string;
  recent: { id: number; amount: string; orderId: number; createdAt: string }[];
  payouts: { id: number; amount: string; method: "balance" | "external"; status: "pending" | "approved" | "rejected"; createdAt: string }[];
}

export function AffiliatesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const currency = useCurrency();
  const { data, isLoading, error } = useQuery({ queryKey: ["affiliates"], queryFn: () => api<AffiliateData>("/affiliates") });
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");
  const [method, setMethod] = useState<"balance" | "external">("balance");
  const link = typeof window !== "undefined" && data ? `${window.location.origin}/r/${data.code}` : "";

  const payout = useMutation({
    mutationFn: () => api<{ instant: boolean }>("/affiliates/payout", { method: "POST", json: { amount, method, details: details || undefined } }),
    onSuccess: (r) => {
      toast(r.instant ? "Moved to your balance" : "Payout requested. We'll let you know when it's sent.");
      setAmount("");
      setDetails("");
      qc.invalidateQueries({ queryKey: ["affiliates"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
  const payoutError = payout.error instanceof ApiError ? (payout.error.fields ? Object.values(payout.error.fields)[0] : payout.error.message) : null;

  if (error) return <PageHeader title="Affiliates" description={error instanceof ApiError ? error.message : "Not available right now."} />;

  return (
    <>
      <PageHeader title="Affiliates" description={data ? `Share your link. You earn ${Number(data.commissionPercent)}% of what the people you refer spend, for as long as they order.` : "Share your link and earn on every order."} />
      {isLoading || !data ? (
        <Skeleton className="h-72" />
      ) : (
        <>
          <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1 sm:p-6">
            <h2 className="text-[15px] font-semibold">Your referral link</h2>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <code className="flex h-11 flex-1 items-center truncate rounded-[11px] border border-line bg-surface-2 px-3.5 font-mono text-[13px]">{link}</code>
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
          </section>

          <Stagger className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { icon: MousePointerClick, label: "Link visits", value: data.visits.toLocaleString() },
              { icon: UserPlus, label: "Sign-ups", value: data.signups.toLocaleString() },
              { icon: Gift, label: "Earned all time", value: formatMoney(data.earned, currency) },
              { icon: Wallet, label: "Available", value: formatMoney(data.balance, currency) },
            ].map((t) => (
              <StaggerItem key={t.label} className="h-full">
                <TiltCard className="h-full p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-ink-3">{t.label}</p>
                    <t.icon className="size-4 text-ink-3" aria-hidden />
                  </div>
                  <p className="depth-1 tabular mt-3 text-[26px] font-semibold tracking-[-0.02em]">{t.value}</p>
                </TiltCard>
              </StaggerItem>
            ))}
          </Stagger>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1 sm:p-6">
              <h2 className="text-[15px] font-semibold">Withdraw earnings</h2>
              <p className="mt-1 text-[14px] text-ink-3">Minimum {formatMoney(data.minPayout, currency)}. Moving to your balance is instant.</p>
              <form
                className="mt-4 grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  payout.mutate();
                }}
              >
                <div role="radiogroup" aria-label="Where to" className="grid grid-cols-2 gap-2 rounded-xl bg-bg-subtle p-1">
                  {(["balance", "external"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={method === m}
                      onClick={() => setMethod(m)}
                      className={`h-9 rounded-lg text-[14px] font-medium transition-[background-color,box-shadow,color] ${method === m ? "bg-surface text-ink shadow-1" : "text-ink-3 hover:text-ink"}`}
                    >
                      {m === "balance" ? "To my balance" : "Pay me out"}
                    </button>
                  ))}
                </div>
                <Field label="Amount (USD)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder={Number(data.balance).toFixed(2)} />
                {method === "external" && <Field label="Where should we send it?" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="e.g. USDT TRC20 address or bank details" />}
                <FormAlert message={payoutError ?? null} />
                <Button type="submit" loading={payout.isPending} disabled={!amount} className="justify-self-start">
                  {method === "balance" ? "Move to balance" : "Request payout"}
                </Button>
              </form>
            </section>

            <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1 sm:p-6">
              <h2 className="text-[15px] font-semibold">Recent activity</h2>
              {data.recent.length === 0 && data.payouts.length === 0 ? (
                <p className="mt-6 text-center text-[14px] text-ink-3">Commission shows up here when people you refer complete orders.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line text-[14px]">
                  {data.payouts.map((p) => (
                    <li key={`p${p.id}`} className="flex items-center justify-between gap-3 py-2.5">
                      <span>
                        {p.method === "balance" ? "Moved to balance" : "Payout"} <span className="text-[12.5px] text-ink-3">· {new Date(p.createdAt).toLocaleDateString()}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge tone={p.status === "approved" ? "success" : p.status === "rejected" ? "danger" : "warning"}>{p.status === "approved" ? "Done" : p.status === "rejected" ? "Declined" : "Pending"}</Badge>
                        <span className="tabular font-mono text-[13px]">−{formatMoney(p.amount, currency)}</span>
                      </span>
                    </li>
                  ))}
                  {data.recent.map((r) => (
                    <li key={`e${r.id}`} className="flex items-center justify-between gap-3 py-2.5">
                      <span>
                        Commission <span className="text-[12.5px] text-ink-3">· order #{r.orderId} · {new Date(r.createdAt).toLocaleDateString()}</span>
                      </span>
                      <span className="tabular font-mono text-[13px] text-success">+{formatMoney(r.amount, currency, { rate: true })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}

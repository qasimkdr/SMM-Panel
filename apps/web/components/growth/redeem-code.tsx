"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/auth/form-alert";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useCurrency } from "@/lib/hooks/queries";

export function RedeemCode() {
  const qc = useQueryClient();
  const currency = useCurrency();
  const [code, setCode] = useState("");
  const m = useMutation({
    mutationFn: () => api<{ amount: string }>("/coupons/redeem", { method: "POST", json: { code } }),
    onSuccess: () => {
      setCode("");
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
  return (
    <section className="mx-auto mt-5 max-w-xl rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <Gift className="size-4 text-ink-3" aria-hidden /> Have a code?
      </h2>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) m.mutate();
        }}
      >
        <label htmlFor="redeem" className="sr-only">
          Promo code
        </label>
        <input
          id="redeem"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter a promo code"
          autoComplete="off"
          className="h-11 flex-1 rounded-[11px] border border-line bg-surface px-3.5 font-mono text-[14px] uppercase tracking-wide focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
        />
        <Button type="submit" size="lg" loading={m.isPending} disabled={!code.trim()}>
          Redeem
        </Button>
      </form>
      <div className="mt-3">
        <FormAlert tone="success" message={m.data ? `${formatMoney(m.data.amount, currency)} added to your balance.` : null} />
        <FormAlert message={m.error instanceof ApiError ? m.error.message : null} />
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { parseMassOrder } from "@smm/shared";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/auth/form-alert";
import { api, ApiError } from "@/lib/api";

type Result = { line: number; ok: boolean; order?: number; charge?: string; error?: string };

export function MassOrderForm() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const count = parseMassOrder(text).length;
  const m = useMutation({
    mutationFn: () => api<{ results: Result[]; placed: number; failed: number }>("/orders/mass", { method: "POST", json: { text } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  return (
    <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1 sm:p-6">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (count) m.mutate();
        }}
      >
        <div className="grid gap-1.5">
          <label htmlFor="mass" className="text-[13px] font-medium text-ink-2">
            One order per line
          </label>
          <textarea
            id="mass"
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={"service_id | link | quantity\n5 | https://instagram.com/yourbrand | 1000\n6 | https://tiktok.com/@you/video/123 | 5000"}
            aria-describedby="mass-help"
            className="rounded-[11px] border border-line bg-surface-2 p-3 font-mono text-[13px] leading-relaxed focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
          />
          <p id="mass-help" className="text-[13px] text-ink-3">
            Format: <code className="font-mono">service_id | link | quantity</code>. Up to 500 lines. Each line is placed on its own, so one bad line won&apos;t stop the rest.
          </p>
        </div>
        <FormAlert message={m.error instanceof ApiError ? (m.error.fields?.text ?? m.error.message) : null} />
        <Button type="submit" size="lg" loading={m.isPending} disabled={!count} className="w-full sm:w-auto sm:justify-self-start">
          Place {count || ""} order{count === 1 ? "" : "s"}
        </Button>
      </form>

      {m.data && (
        <div className="mt-6">
          <p className="text-[14px] font-medium" role="status">
            {m.data.placed} placed{m.data.failed ? `, ${m.data.failed} failed` : ""}
          </p>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line text-[14px]">
            {m.data.results.map((r) => (
              <li key={r.line} className="flex items-start gap-3 px-3.5 py-2.5">
                {r.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />}
                <span className="font-mono text-[12.5px] text-ink-3">Line {r.line}</span>
                <span className={r.ok ? "" : "text-danger"}>{r.ok ? `Order #${r.order} placed` : r.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

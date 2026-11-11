"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LifeBuoy, MessageSquarePlus, Send } from "lucide-react";
import { TICKET_TOPICS, ticketCreateSchema } from "@smm/shared";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormAlert } from "@/components/auth/form-alert";
import { useToast } from "@/components/ui/toast";
import { useForm } from "@/components/auth/use-form";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

export interface TicketSummary {
  id: number;
  subject: string;
  topic: string;
  status: "open" | "answered" | "customer_reply" | "closed";
  lastReplyAt: string;
  createdAt: string;
}
export interface TicketThread extends TicketSummary {
  orderIds: string | null;
  messages: { id: number; body: string; isStaff: boolean; author: string | null; createdAt: string }[];
}

export function TicketStatus({ status, admin = false }: { status: TicketSummary["status"]; admin?: boolean }) {
  if (status === "closed") return <Badge>Closed</Badge>;
  if (status === "answered") return <Badge tone="success">{admin ? "Answered" : "New reply"}</Badge>;
  return <Badge tone={admin ? "warning" : "info"}>{admin ? "Waiting for us" : "Waiting for support"}</Badge>;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function NewTicket({ onDone }: { onDone: (id: number) => void }) {
  const { errors, formError, pending, submit } = useForm(ticketCreateSchema);
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        submit(
          { subject: fd.get("subject"), topic: fd.get("topic"), orderIds: String(fd.get("orderIds") || "") || undefined, message: fd.get("message") },
          async (v) => {
            const r = await api<{ id: number }>("/tickets", { method: "POST", json: v });
            onDone(r.id);
          },
        );
      }}
    >
      <FormAlert message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select name="topic" label="What's it about?" defaultValue="order">
          {TICKET_TOPICS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <Field name="orderIds" label="Order numbers (optional)" placeholder="e.g. 1024, 1031" error={errors.orderIds} />
      </div>
      <Field name="subject" label="Subject" placeholder="A few words, e.g. Order hasn't started" error={errors.subject} />
      <div className="grid gap-1.5">
        <label htmlFor="t-message" className="text-[13px] font-medium text-ink-2">
          Message
        </label>
        <textarea
          id="t-message"
          name="message"
          rows={6}
          aria-invalid={errors.message ? true : undefined}
          placeholder="What happened, and what would you like us to do? Include links if it helps."
          className={cn("rounded-[11px] border bg-surface p-3 text-[14px] leading-relaxed focus:border-accent focus:shadow-[var(--ring)] focus:outline-none", errors.message ? "border-danger" : "border-line")}
        />
        {errors.message && <p className="text-[13px] text-danger">{errors.message}</p>}
      </div>
      <Button type="submit" loading={pending} className="justify-self-start">
        <Send className="size-4" aria-hidden /> Send to support
      </Button>
    </form>
  );
}

export function SupportList() {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["tickets"], queryFn: () => api<TicketSummary[]>("/tickets"), refetchInterval: 60_000 });
  return (
    <>
      <PageHeader
        title="Support"
        description="Ask about an order, a refill or your balance. We usually reply within a few hours."
        actions={
          !composing && (
            <Button onClick={() => setComposing(true)}>
              <MessageSquarePlus className="size-4" aria-hidden /> New ticket
            </Button>
          )
        }
      />
      {composing && (
        <section className="mb-6 rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">New ticket</h2>
            <Button variant="ghost" size="sm" onClick={() => setComposing(false)}>
              Cancel
            </Button>
          </div>
          <NewTicket onDone={(id) => router.push(`/dashboard/support/${id}`)} />
        </section>
      )}
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1">
        {isLoading ? (
          <Skeleton className="m-4 h-32" />
        ) : !data?.length ? (
          <div className="grid place-items-center px-6 py-14 text-center">
            <LifeBuoy className="size-6 text-ink-3" aria-hidden />
            <p className="mt-3 font-medium">No tickets yet</p>
            <p className="mt-1 max-w-sm text-sm text-ink-3">If something isn't right with an order, open a ticket and we'll look into it.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {data.map((t) => (
              <li key={t.id}>
                <Link href={`/dashboard/support/${t.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-bg-subtle/60">
                  <span className="font-mono text-[12.5px] text-ink-3">#{t.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[14px]", t.status === "answered" ? "font-semibold" : "font-medium")}>{t.subject}</span>
                    <span className="text-[12.5px] text-ink-3">Updated {when(t.lastReplyAt)}</span>
                  </span>
                  <TicketStatus status={t.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function Thread({ messages, viewer }: { messages: TicketThread["messages"]; viewer: "customer" | "staff" }) {
  return (
    <ol className="grid gap-3">
      {messages.map((m) => {
        const mine = viewer === "staff" ? m.isStaff : !m.isStaff;
        return (
          <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl border px-4 py-3 sm:max-w-[75%]", mine ? "border-accent-line bg-accent-soft" : "border-line bg-surface")}>
              <p className="text-[12px] text-ink-3">
                <span className="font-medium text-ink-2">{m.isStaff ? (viewer === "staff" ? `${m.author ?? "Staff"} (staff)` : "Support") : (m.author ?? "Customer")}</span> · {when(m.createdAt)}
              </p>
              <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-ink">{m.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function TicketView({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reply, setReply] = useState("");
  const { data: t, isLoading } = useQuery({ queryKey: ["ticket", id], queryFn: () => api<TicketThread>(`/tickets/${id}`), refetchInterval: 30_000 });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
  };
  const send = useMutation({
    mutationFn: () => api(`/tickets/${id}/reply`, { method: "POST", json: { message: reply } }),
    onSuccess: () => {
      setReply("");
      refresh();
    },
    onError: (e) => toast(e instanceof ApiError ? (e.fields?.message ?? e.message) : "Couldn't send", "danger"),
  });
  const close = useMutation({ mutationFn: () => api(`/tickets/${id}/close`, { method: "POST" }), onSuccess: () => (toast("Ticket closed"), refresh()) });

  return (
    <>
      <Link href="/dashboard/support" className="mb-4 inline-flex items-center gap-1.5 text-[14px] text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Support
      </Link>
      {isLoading || !t ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <PageHeader
            title={t.subject}
            description={
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono">#{t.id}</span>
                <TicketStatus status={t.status} />
                {t.orderIds && <span>Orders: {t.orderIds}</span>}
              </span>
            }
            actions={
              t.status !== "closed" && (
                <Button variant="ghost" size="sm" loading={close.isPending} onClick={() => close.mutate()}>
                  Close ticket
                </Button>
              )
            }
          />
          <Thread messages={t.messages} viewer="customer" />
          {t.status === "closed" ? (
            <p className="mt-6 rounded-xl bg-bg-subtle px-4 py-3 text-[14px] text-ink-3">This ticket is closed. Open a new one if you need more help.</p>
          ) : (
            <form
              className="mt-6 grid gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (reply.trim()) send.mutate();
              }}
            >
              <label htmlFor="reply" className="sr-only">
                Your reply
              </label>
              <textarea
                id="reply"
                rows={4}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply…"
                className="rounded-[11px] border border-line bg-surface p-3 text-[14px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
              />
              <Button type="submit" loading={send.isPending} disabled={!reply.trim()} className="justify-self-end">
                <Send className="size-4" aria-hidden /> Send reply
              </Button>
            </form>
          )}
        </>
      )}
    </>
  );
}

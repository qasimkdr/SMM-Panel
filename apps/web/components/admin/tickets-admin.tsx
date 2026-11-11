"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Lock, MessageSquareReply, Plus, Send, Trash2, Unlock } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Thread, TicketStatus, type TicketThread } from "@/components/support/tickets";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

interface AdminTicket {
  id: number;
  userId: number;
  username: string;
  email: string;
  subject: string;
  topic: string;
  orderIds: string | null;
  status: TicketThread["status"];
  lastReplyAt: string;
}
interface Canned {
  id: number;
  title: string;
  body: string;
}

const FILTERS = [
  ["waiting", "Waiting for us"],
  ["answered", "Answered"],
  ["closed", "Closed"],
  ["all", "All"],
] as const;
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${Math.max(1, m)} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
};

function CannedManager({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "canned"], queryFn: () => api<Canned[]>("/admin/canned-replies") });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const add = useMutation({ mutationFn: () => api("/admin/canned-replies", { method: "POST", json: { title, body } }), onSuccess: () => (setTitle(""), setBody(""), qc.invalidateQueries({ queryKey: ["admin", "canned"] })) });
  const del = useMutation({ mutationFn: (id: number) => api(`/admin/canned-replies/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "canned"] }) });
  return (
    <Dialog open onClose={onClose} title="Saved replies" description="Reusable answers for common questions. Insert one with a click while replying.">
      <div className="grid gap-4">
        <ul className="divide-y divide-line rounded-xl border border-line">
          {(data ?? []).map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium">{c.title}</span>
                <span className="line-clamp-2 text-[13px] text-ink-3">{c.body}</span>
              </span>
              <button onClick={() => del.mutate(c.id)} aria-label={`Delete ${c.title}`} className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-danger-soft hover:text-danger">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
          {!data?.length && <li className="px-3 py-6 text-center text-[13px] text-ink-3">No saved replies yet.</li>}
        </ul>
        <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Order is processing" />
        <div className="grid gap-1.5">
          <label htmlFor="canned-body" className="text-[13px] font-medium text-ink-2">
            Reply text
          </label>
          <textarea id="canned-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} className="rounded-[11px] border border-line bg-surface p-3 text-[14px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none" />
        </div>
        <Button className="justify-self-start" disabled={title.length < 2 || body.length < 2} loading={add.isPending} onClick={() => add.mutate()}>
          <Plus className="size-4" aria-hidden /> Save reply
        </Button>
      </div>
    </Dialog>
  );
}

function TicketPane({ id }: { id: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reply, setReply] = useState("");
  const { data: t, isLoading } = useQuery({
    queryKey: ["admin", "ticket", id],
    queryFn: () => api<TicketThread & { customer: { username: string; email: string; balance: string } }>(`/admin/tickets/${id}`),
  });
  const canned = useQuery({ queryKey: ["admin", "canned"], queryFn: () => api<Canned[]>("/admin/canned-replies") });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "ticket", id] });
    qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
  };
  const send = useMutation({
    mutationFn: (close: boolean) => api(`/admin/tickets/${id}/reply`, { method: "POST", json: { message: reply, close } }),
    onSuccess: (_r, close) => {
      setReply("");
      toast(close ? "Replied and closed" : "Reply sent. The customer was notified.");
      refresh();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't send", "danger"),
  });
  const setStatus = useMutation({ mutationFn: (status: "open" | "closed") => api(`/admin/tickets/${id}/status`, { method: "POST", json: { status } }), onSuccess: refresh });

  if (isLoading || !t) return <Skeleton className="h-96" />;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight">{t.subject}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
            <span className="font-mono">#{t.id}</span> · {t.customer.username} ({t.customer.email}) · balance ${Number(t.customer.balance).toFixed(2)}
            {t.orderIds && <span>· orders {t.orderIds}</span>}
            <TicketStatus status={t.status} admin />
          </p>
        </div>
        {t.status === "closed" ? (
          <Button variant="secondary" size="sm" onClick={() => setStatus.mutate("open")}>
            <Unlock className="size-3.5" aria-hidden /> Reopen
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setStatus.mutate("closed")}>
            <Lock className="size-3.5" aria-hidden /> Close
          </Button>
        )}
      </div>
      <div className="max-h-[52vh] overflow-y-auto pr-1">
        <Thread messages={t.messages} viewer="staff" />
      </div>
      <form
        className="grid gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (reply.trim()) send.mutate(false);
        }}
      >
        {canned.data?.length ? (
          <div className="flex flex-wrap gap-1.5" aria-label="Insert a saved reply">
            {canned.data.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setReply((r) => (r ? `${r}\n\n${c.body}` : c.body))}
                className="rounded-full border border-line bg-surface-2 px-3 py-1 text-[12.5px] text-ink-2 hover:border-line-strong hover:text-ink"
              >
                {c.title}
              </button>
            ))}
          </div>
        ) : null}
        <label htmlFor="admin-reply" className="sr-only">
          Reply to customer
        </label>
        <textarea
          id="admin-reply"
          rows={5}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Write a reply. The customer gets a notification and an email."
          className="rounded-[11px] border border-line bg-surface p-3 text-[14px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={!reply.trim()} loading={send.isPending && send.variables === true} onClick={() => send.mutate(true)}>
            Reply and close
          </Button>
          <Button type="submit" disabled={!reply.trim()} loading={send.isPending && send.variables === false}>
            <Send className="size-4" aria-hidden /> Send reply
          </Button>
        </div>
      </form>
    </div>
  );
}

export function TicketsAdmin() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("waiting");
  const [openId, setOpenId] = useState<number | null>(null);
  const [cannedOpen, setCannedOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "tickets", filter],
    queryFn: () => api<{ items: AdminTicket[]; waiting: number }>(`/admin/tickets?status=${filter}`),
    refetchInterval: 30_000,
  });
  return (
    <>
      <PageHeader
        title="Support tickets"
        description={data ? `${data.waiting} waiting for a reply. Oldest first, so nobody waits too long.` : "Customer questions, oldest first."}
        actions={
          <Button variant="secondary" onClick={() => setCannedOpen(true)}>
            <MessageSquareReply className="size-4" aria-hidden /> Saved replies
          </Button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div>
          <div className="mb-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Ticket filter">
            {FILTERS.map(([v, l]) => (
              <button
                key={v}
                role="tab"
                aria-selected={filter === v}
                onClick={() => setFilter(v)}
                className={cn("h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors", filter === v ? "bg-ink text-bg" : "text-ink-2 hover:bg-bg-subtle")}
              >
                {l}
                {v === "waiting" && data?.waiting ? ` (${data.waiting})` : ""}
              </button>
            ))}
          </div>
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1">
            {isLoading ? (
              <Skeleton className="m-3 h-40" />
            ) : !data?.items.length ? (
              <div className="grid place-items-center px-6 py-12 text-center">
                <Inbox className="size-6 text-ink-3" aria-hidden />
                <p className="mt-3 text-[14px] font-medium">Inbox zero</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {data.items.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => setOpenId(t.id)}
                      aria-current={openId === t.id ? "true" : undefined}
                      className={cn("block w-full px-4 py-3 text-left transition-colors hover:bg-bg-subtle/60", openId === t.id && "bg-accent-soft/50")}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[14px] font-medium">{t.subject}</span>
                        <span className="shrink-0 text-[12px] text-ink-3">{ago(t.lastReplyAt)}</span>
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[12.5px] text-ink-3">
                        {t.username} · <Badge className="h-5">{t.topic}</Badge>
                        {t.status === "customer_reply" && <Badge tone="warning" className="h-5">New reply</Badge>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <section className="min-w-0 rounded-[var(--radius-lg)] border border-line bg-surface-2 p-5 shadow-1">
          {openId ? (
            <TicketPane key={openId} id={openId} />
          ) : (
            <div className="grid h-full min-h-[320px] place-items-center text-center text-[14px] text-ink-3">Pick a ticket to read and reply.</div>
          )}
        </section>
      </div>
      {cannedOpen && <CannedManager onClose={() => setCannedOpen(false)} />}
    </>
  );
}

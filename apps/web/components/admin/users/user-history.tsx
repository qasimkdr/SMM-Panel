"use client";

import { useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Settings2 } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TiltCard } from "@/components/ui/tilt-card";
import { Stagger, StaggerItem } from "@/components/ui/reveal";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { UserSheet } from "./user-sheet";

interface UserInfo {
  id: number;
  username: string;
  email: string;
  name: string | null;
  status: "active" | "banned";
  role: string;
  balance: string;
  spent: string;
  createdAt: string;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
}
interface Summary {
  deposits: string;
  adminAdded: string;
  adminDeducted: string;
  orders: string;
  refunds: string;
  bonuses: string;
  ordersByStatus: Record<string, number>;
}
type Row = Record<string, unknown> & { id: number; createdAt: string };

const TABS = [
  { id: "payments", label: "Deposits" },
  { id: "transactions", label: "Balance history" },
  { id: "orders", label: "Orders" },
  { id: "tickets", label: "Tickets" },
  { id: "logins", label: "Sign-ins" },
  { id: "admin", label: "Staff actions" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const usd = (v: unknown, digits = 2) => `$${Math.abs(Number(v)).toFixed(digits)}`;
const signed = (v: unknown) => `${Number(v) >= 0 ? "+" : "−"}${usd(v, 4)}`;
const when = (v: string) => new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const tone = (s: string) =>
  (({ completed: "success", approved: "success", pending: "warning", processing: "info", in_progress: "info", partial: "warning", canceled: "neutral", fail: "danger", rejected: "danger", open: "warning", answered: "success", customer_reply: "warning", closed: "neutral" }) as const)[
    s as "completed"
  ] ?? "neutral";
const nice = (s: unknown) => String(s ?? "").replace(/_/g, " ");

export function UserHistory({ userId }: { userId: number }) {
  const [tab, setTab] = useState<Tab>("payments");
  const [manage, setManage] = useState(false);
  const reduce = useReducedMotion();
  const user = useQuery({ queryKey: ["admin", "user", userId], queryFn: () => api<UserInfo>(`/admin/users/${userId}`) });
  const summary = useQuery({ queryKey: ["admin", "user-summary", userId], queryFn: () => api<Summary>(`/admin/users/${userId}/summary`) });
  const u = user.data;
  const s = summary.data;
  const adminNet = s ? Number(s.adminAdded) + Number(s.adminDeducted) : 0;
  const orderCount = s ? Object.values(s.ordersByStatus).reduce((a, b) => a + b, 0) : 0;

  const stats = s && u
    ? [
        { label: "Balance now", value: usd(u.balance), sub: u.status === "banned" ? "Account banned" : "Available to spend" },
        { label: "Deposited", value: usd(s.deposits), sub: "Approved payments" },
        { label: "Spent on orders", value: usd(s.orders), sub: `${orderCount} order${orderCount === 1 ? "" : "s"}` },
        { label: "Refunded", value: usd(s.refunds), sub: "Back to balance" },
        { label: "Staff adjustments", value: `${adminNet >= 0 ? "+" : "−"}${usd(adminNet)}`, sub: `+${usd(s.adminAdded)} / −${usd(s.adminDeducted)}` },
        { label: "Bonuses & codes", value: usd(s.bonuses), sub: "Promo codes, affiliate" },
      ]
    : null;

  return (
    <>
      <Link href="/users" className="mb-3 inline-flex items-center gap-1.5 text-[14px] text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All users
      </Link>
      <PageHeader
        title={u ? u.username : "User"}
        description={u ? `${u.name ? `${u.name} · ` : ""}${u.email} · joined ${new Date(u.createdAt).toLocaleDateString()}${u.lastLoginIp ? ` · last IP ${u.lastLoginIp}` : ""}` : undefined}
        actions={
          <Button variant="secondary" onClick={() => setManage(true)}>
            <Settings2 className="size-4" aria-hidden /> Manage user
          </Button>
        }
      />

      {!stats ? (
        <Skeleton className="mb-6 h-28" />
      ) : (
        <Stagger gap={0.05} className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {stats.map((st) => (
            <StaggerItem key={st.label}>
              <TiltCard max={5} className="h-full p-4">
                <p className="text-[12px] text-ink-3">{st.label}</p>
                <p className="depth-1 mt-1 font-mono text-[20px] font-semibold tabular-nums tracking-tight">{st.value}</p>
                <p className="mt-0.5 truncate text-[12px] text-ink-3">{st.sub}</p>
              </TiltCard>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <div role="tablist" aria-label="History" className="mb-4 flex gap-1 overflow-x-auto rounded-[12px] border border-line bg-bg-subtle p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="history-panel"
            onClick={() => setTab(t.id)}
            className={cn("relative h-9 shrink-0 rounded-[9px] px-3.5 text-[14px] font-medium transition-colors", tab === t.id ? "text-ink" : "text-ink-3 hover:text-ink")}
          >
            {tab === t.id && <motion.span layoutId={reduce ? undefined : "history-tab"} className="absolute inset-0 rounded-[9px] bg-surface shadow-1" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>

      <motion.div
        key={tab}
        id="history-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <HistoryList userId={userId} kind={tab} />
      </motion.div>

      {manage && <UserSheet userId={userId} onClose={() => setManage(false)} />}
    </>
  );
}

function HistoryList({ userId, kind }: { userId: number; kind: Tab }) {
  const q = useInfiniteQuery({
    queryKey: ["admin", "user-history", userId, kind],
    queryFn: ({ pageParam }) => api<{ items: Row[]; nextCursor: number | null }>(`/admin/users/${userId}/history/${kind}${pageParam ? `?cursor=${pageParam}` : ""}`),
    initialPageParam: 0,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  const cols = COLUMNS[kind];
  return (
    <>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[14px]">
            <thead className="border-b border-line bg-surface-2 text-[12px] text-ink-3">
              <tr>
                {cols.map((c) => (
                  <th key={c.label} className={cn("px-4 py-3 font-medium", c.right && "text-right")}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.isLoading && (
                <tr>
                  <td colSpan={cols.length} className="px-4 py-3">
                    <Skeleton className="h-24" />
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  {cols.map((c) => (
                    <td key={c.label} className={cn("px-4 py-2.5 align-top", c.right && "text-right", c.mono && "font-mono tabular-nums")}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
              {!q.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={cols.length} className="px-4 py-10 text-center text-ink-3">
                    Nothing here yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {q.hasNextPage && (
        <Button variant="secondary" className="mt-4" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
          Load older
        </Button>
      )}
    </>
  );
}

type Col = { label: string; render: (r: Row) => React.ReactNode; right?: boolean; mono?: boolean };
const dateCol: Col = { label: "When", render: (r) => <span className="whitespace-nowrap text-ink-2">{when(r.createdAt)}</span> };
const status = (r: Row) => <Badge tone={tone(String(r.status))}>{nice(r.status)}</Badge>;

const COLUMNS: Record<Tab, Col[]> = {
  payments: [
    dateCol,
    { label: "Method", render: (r) => String(r.method ?? "—") },
    { label: "Sent", right: true, mono: true, render: (r) => (r.amountLocal ? `${r.currency} ${Number(r.amountLocal).toLocaleString("en-US")}` : "—") },
    { label: "Credit", right: true, mono: true, render: (r) => usd(r.amount) },
    { label: "Transaction ID", mono: true, render: (r) => <span className="text-[13px]">{String(r.txnId ?? "—")}</span> },
    { label: "Status", render: (r) => (
      <span className="grid gap-1">
        {status(r)}
        {r.adminNote ? <span className="text-[12px] text-ink-3">{String(r.adminNote)}</span> : null}
      </span>
    ) },
  ],
  transactions: [
    dateCol,
    { label: "What", render: (r) => (
      <span className="grid">
        <span className="capitalize">{nice(r.type)}</span>
        {r.note ? <span className="text-[12px] text-ink-3">{String(r.note)}</span> : null}
      </span>
    ) },
    { label: "By", render: (r) => <span className="text-ink-2">{r.actor ? String(r.actor) : "System"}</span> },
    { label: "Amount", right: true, mono: true, render: (r) => <span className={Number(r.amount) >= 0 ? "text-success" : ""}>{signed(r.amount)}</span> },
    { label: "Balance after", right: true, mono: true, render: (r) => usd(r.balanceAfter, 4) },
  ],
  orders: [
    dateCol,
    { label: "Order", mono: true, render: (r) => `#${r.id}` },
    { label: "Service", render: (r) => (
      <span className="grid max-w-[320px]">
        <span className="truncate">{String(r.service ?? "—")}</span>
        <span className="truncate text-[12px] text-ink-3">{String(r.link)}</span>
      </span>
    ) },
    { label: "Qty", right: true, mono: true, render: (r) => Number(r.quantity).toLocaleString("en-US") },
    { label: "Charge", right: true, mono: true, render: (r) => usd(r.charge, 4) },
    { label: "Status", render: status },
  ],
  tickets: [
    dateCol,
    { label: "Ticket", render: (r) => (
      <span>
        <span className="font-mono text-ink-3">#{r.id}</span> {String(r.subject)}
      </span>
    ) },
    { label: "Topic", render: (r) => <span className="capitalize">{nice(r.topic)}</span> },
    { label: "Status", render: status },
  ],
  logins: [
    dateCol,
    { label: "IP", mono: true, render: (r) => String(r.ip ?? "—") },
    { label: "Device", render: (r) => <span className="block max-w-[420px] truncate text-[13px] text-ink-2">{String(r.userAgent ?? "—")}</span> },
    { label: "Result", render: (r) => (r.success ? <Badge tone="success">Signed in</Badge> : <Badge tone="danger">Wrong password</Badge>) },
  ],
  admin: [
    dateCol,
    { label: "Staff", render: (r) => String(r.actor ?? "—") },
    { label: "Action", render: (r) => <span className="font-mono text-[13px]">{String(r.action)}</span> },
    { label: "Details", render: (r) => <span className="block max-w-[420px] truncate font-mono text-[12px] text-ink-3">{r.meta ? JSON.stringify(r.meta) : "—"}</span> },
  ],
};

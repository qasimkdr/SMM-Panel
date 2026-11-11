"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, Hand, ListOrdered, Server, Table2, TrendingUp, UserPlus, Wallet } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { TiltCard } from "@/components/ui/tilt-card";
import { Stagger, StaggerItem } from "@/components/ui/reveal";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { BarChart, ChartTable, LineChart } from "./charts";

interface Totals {
  revenue: string;
  profit: string;
  orders: number;
  newUsers: number;
}
interface DashboardData {
  days: number;
  today: Totals;
  week: Totals;
  period: Totals;
  series: { day: string; revenue: number; profit: number; orders: number }[];
  topServices: { serviceId: number; name: string | null; orders: number; revenue: string; profit: string }[];
  attention: { failed: number; manualQueue: number; active: number };
  customerBalances: string;
  providers: { id: number; name: string; balance: string | null; currency: string; lowBalanceAlert: string | null; errorCount: number }[];
}

const usd = (v: number | string) => {
  const n = Number(v);
  const a = Math.abs(n);
  const s = a.toLocaleString("en-US", { minimumFractionDigits: a >= 1000 ? 0 : 2, maximumFractionDigits: a >= 1000 ? 0 : 2 });
  return n < 0 ? `-$${s}` : `$${s}`;
};
const usdAxis = (v: number) =>
  v >= 1000 ? `$${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k` : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function AdminDashboard() {
  const [days, setDays] = useState(30);
  const [table, setTable] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "dashboard", days],
    queryFn: () => api<DashboardData>(`/admin/dashboard?days=${days}`),
    refetchInterval: 60_000,
    placeholderData: (p) => p,
  });

  const tiles = data
    ? [
        { label: "Revenue", icon: TrendingUp, value: usd(data.period.revenue), sub: `${usd(data.today.revenue)} today` },
        { label: "Profit", icon: Wallet, value: usd(data.period.profit), sub: `${usd(data.today.profit)} today` },
        { label: "Orders", icon: ListOrdered, value: data.period.orders.toLocaleString(), sub: `${data.today.orders} today · ${data.attention.active} active` },
        { label: "New customers", icon: UserPlus, value: data.period.newUsers.toLocaleString(), sub: `${data.today.newUsers} today` },
      ]
    : [];

  const attention = data
    ? ([
        data.attention.failed > 0 && {
          href: "/orders",
          tone: "danger",
          icon: AlertTriangle,
          text: `${data.attention.failed} order${data.attention.failed === 1 ? "" : "s"} need attention`,
        },
        data.attention.manualQueue > 0 && {
          href: "/orders",
          tone: "accent",
          icon: Hand,
          text: `${data.attention.manualQueue} manual order${data.attention.manualQueue === 1 ? "" : "s"} waiting for your team`,
        },
        ...data.providers
          .filter((p) => (p.lowBalanceAlert && p.balance && Number(p.balance) < Number(p.lowBalanceAlert)) || p.errorCount > 0)
          .map((p) => ({
            href: "/providers",
            tone: "warning",
            icon: Server,
            text: p.errorCount > 0 ? `${p.name} is returning errors` : `${p.name} balance is low (${p.balance} ${p.currency})`,
          })),
      ].filter(Boolean) as { href: string; tone: string; icon: typeof Server; text: string }[])
    : [];

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Revenue is after refunds. Figures for the last ${days} days.`}
        actions={
          <div role="radiogroup" aria-label="Period" className="inline-flex rounded-xl bg-bg-subtle p-1">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                role="radio"
                aria-checked={days === d}
                onClick={() => setDays(d)}
                className={cn(
                  "h-8 rounded-lg px-3 text-[13px] font-medium transition-[background-color,box-shadow,color]",
                  days === d ? "bg-surface text-ink shadow-1" : "text-ink-3 hover:text-ink",
                )}
              >
                {d} days
              </button>
            ))}
          </div>
        }
      />

      {isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <>
          {attention.length > 0 && (
            <ul className="mb-5 grid gap-2">
              {attention.map((a) => (
                <li key={a.text}>
                  <Link
                    href={a.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-4 py-3 text-[14px] transition-transform duration-200 hover:-translate-y-px",
                      a.tone === "danger" ? "bg-danger-soft text-danger" : a.tone === "warning" ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent-text",
                    )}
                  >
                    <a.icon className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1">{a.text}</span>
                    <ArrowUpRight className="size-4" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {tiles.map((t) => (
              <StaggerItem key={t.label} className="h-full">
                <TiltCard className="h-full p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-ink-3">{t.label}</p>
                    <t.icon className="size-4 text-ink-3" aria-hidden />
                  </div>
                  <p className="depth-1 tabular mt-3 text-[28px] font-semibold tracking-[-0.02em]">{t.value}</p>
                  <p className="mt-1 text-[13px] text-ink-3">{t.sub}</p>
                </TiltCard>
              </StaggerItem>
            ))}
          </Stagger>

          <section className="mt-5 rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold">Revenue and profit per day</h2>
              <button
                onClick={() => setTable((t) => !t)}
                aria-pressed={table}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-ink-2 hover:bg-bg-subtle hover:text-ink"
              >
                <Table2 className="size-4" aria-hidden /> {table ? "Show chart" : "Show table"}
              </button>
            </div>
            {table ? (
              <ChartTable
                data={data.series}
                columns={[
                  { key: "revenue", label: "Revenue", format: (v) => usd(v) },
                  { key: "profit", label: "Profit", format: (v) => usd(v) },
                  { key: "orders", label: "Orders" },
                ]}
              />
            ) : (
              <LineChart
                title={`Revenue and profit per day, last ${days} days`}
                data={data.series}
                series={[
                  { key: "revenue", label: "Revenue", color: "var(--viz-1)" },
                  { key: "profit", label: "Profit", color: "var(--viz-2)" },
                ]}
                format={usdAxis}
              />
            )}
          </section>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <section className="min-w-0 rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1">
              <h2 className="mb-3 text-[15px] font-semibold">Orders per day</h2>
              <BarChart data={data.series} valueKey="orders" label="Orders" />
            </section>
            <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1">
              <h2 className="text-[15px] font-semibold">Top services</h2>
              {data.topServices.length ? (
                <ol className="mt-3 divide-y divide-line">
                  {data.topServices.map((s, i) => (
                    <li key={s.serviceId} className="flex items-center gap-3 py-2.5">
                      <span className="font-mono text-[12px] text-ink-3">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{s.name ?? `Service #${s.serviceId}`}</span>
                        <span className="text-[12.5px] text-ink-3">
                          {s.orders} order{s.orders === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="tabular block text-[14px] font-semibold">{usd(s.revenue)}</span>
                        <span className="tabular text-[12.5px] text-ink-3">{usd(s.profit ?? 0)} profit</span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-6 text-center text-[14px] text-ink-3">No orders in this period yet.</p>
              )}
              <p className="mt-4 border-t border-line pt-3 text-[13px] text-ink-3">
                Customer balances held: <span className="tabular font-medium text-ink">{usd(data.customerBalances)}</span>
              </p>
            </section>
          </div>
        </>
      )}
    </>
  );
}

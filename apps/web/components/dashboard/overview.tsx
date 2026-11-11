"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, CirclePlus, Crown, ListOrdered, MailWarning, Package, Wallet } from "lucide-react";
import { TiltCard } from "@/components/ui/tilt-card";
import { Button, buttonClass } from "@/components/ui/button";
import { Stagger, StaggerItem } from "@/components/ui/reveal";
import { PageHeader, Skeleton } from "./page-header";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useCurrency, useMe } from "@/lib/hooks/queries";

export function Overview() {
  const { data: me, isLoading } = useMe();
  const currency = useCurrency();
  const welcome = useSearchParams().get("welcome");
  const [resent, setResent] = useState<"idle" | "sending" | "sent">("idle");

  const tiles = [
    { label: "Balance", value: me ? formatMoney(me.balance, currency) : null, sub: "Available for new orders", icon: Wallet, href: "/dashboard/add-funds" },
    { label: "Total spent", value: me ? formatMoney(me.spent, currency) : null, sub: "Counts toward your VIP level", icon: ArrowUpRight, href: "/dashboard/orders" },
    {
      label: "VIP level",
      value: me ? (me.tier?.name ?? "Starter") : null,
      sub: me?.discount && Number(me.discount) > 0 ? `${Number(me.discount)}% off every order` : "Spend more to unlock discounts",
      icon: Crown,
      href: "/dashboard/account",
    },
  ];

  return (
    <>
      <PageHeader
        title={me ? `${welcome ? "Welcome" : "Hi"}, ${me.name || me.username}` : "Overview"}
        description="Your balance, orders and shortcuts in one place."
        actions={
          <Link href="/dashboard/new-order" className={buttonClass("primary", "md")}>
            <CirclePlus className="size-4" /> New order
          </Link>
        }
      />

      {me && !me.emailVerified && (
        <div className="mb-6 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-warning/30 bg-warning-soft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2.5 text-[14px] text-warning">
            <MailWarning className="size-4 shrink-0" aria-hidden />
            Confirm your email to start placing orders. We sent a link to {me.email}.
          </p>
          <Button
            variant="secondary"
            size="sm"
            loading={resent === "sending"}
            disabled={resent === "sent"}
            onClick={async () => {
              setResent("sending");
              await api("/auth/resend-verification", { method: "POST" }).catch(() => null);
              setResent("sent");
            }}
          >
            {resent === "sent" ? "Link sent" : "Resend link"}
          </Button>
        </div>
      )}

      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <StaggerItem key={t.label} className="h-full">
            <Link href={t.href} className="block h-full rounded-[var(--radius-lg)]">
              <TiltCard pressable className="h-full p-5">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] text-ink-3">{t.label}</p>
                  <span className="grid size-8 place-items-center rounded-lg bg-bg-subtle text-ink-2">
                    <t.icon className="size-4" aria-hidden />
                  </span>
                </div>
                <div className="depth-1 mt-3">
                  {isLoading || !t.value ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <p className="tabular text-[28px] font-semibold tracking-[-0.02em]">{t.value}</p>
                  )}
                </div>
                {"sub" in t && t.sub && <p className="mt-1 text-[13px] text-ink-3">{t.sub}</p>}
              </TiltCard>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Recent orders</h2>
            <Link href="/dashboard/orders" className="text-[13px] text-ink-3 hover:text-ink">
              View all
            </Link>
          </div>
          <div className="mt-6 grid place-items-center rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
            <ListOrdered className="size-6 text-ink-3" aria-hidden />
            <p className="mt-3 font-medium">No orders yet</p>
            <p className="mt-1 max-w-xs text-sm text-ink-3">Your orders will show up here with live progress.</p>
            <Link href="/dashboard/new-order" className={buttonClass("secondary", "sm", "mt-4")}>
              Place your first order
            </Link>
          </div>
        </section>
        <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1">
          <h2 className="text-[15px] font-semibold">Shortcuts</h2>
          <ul className="mt-4 space-y-2">
            {[
              { href: "/dashboard/services", icon: Package, label: "Browse all services" },
              { href: "/dashboard/account", icon: Crown, label: "VIP levels and API key" },
              { href: "/api-docs", icon: ArrowUpRight, label: "API documentation" },
            ].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="group flex items-center gap-3 rounded-xl border border-line px-3.5 py-3 text-[14px] transition-[transform,border-color] duration-200 hover:-translate-y-px hover:border-line-strong"
                >
                  <l.icon className="size-4 text-ink-3" aria-hidden />
                  <span className="flex-1">{l.label}</span>
                  <ArrowUpRight className="size-4 text-ink-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

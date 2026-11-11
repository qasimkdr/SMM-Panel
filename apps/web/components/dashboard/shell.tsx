"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CirclePlus,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Package,
  Settings,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useCurrency, useMe } from "@/lib/hooks/queries";
import { cn } from "@/lib/cn";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
}

const userNav: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/new-order", label: "New order", icon: CirclePlus },
  { href: "/dashboard/orders", label: "Orders", icon: ListOrdered },
  { href: "/dashboard/services", label: "Services", icon: Package },
  { href: "/dashboard/add-funds", label: "Add funds", icon: Wallet, soon: true },
  { href: "/dashboard/account", label: "Account", icon: Settings },
];

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = item.href === "/dashboard" || item.href === "/" ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-[14px] transition-colors duration-200",
                active ? "bg-surface text-ink shadow-1" : "text-ink-2 hover:bg-surface/60 hover:text-ink",
              )}
            >
              {active && <motion.span layoutId="nav-indicator" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent" />}
              <item.icon className={cn("size-[18px]", active ? "text-accent" : "text-ink-3 group-hover:text-ink-2")} aria-hidden />
              <span className="flex-1">{item.label}</span>
              {item.soon && <span className="rounded-full bg-bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-3">Soon</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function useLogout(redirect: string) {
  const router = useRouter();
  const qc = useQueryClient();
  return async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => null);
    qc.clear();
    router.replace(redirect);
    router.refresh();
  };
}

export function Shell({
  children,
  siteName,
  nav = userNav,
  homeHref = "/dashboard",
  badge,
  logoutTo = "/login",
}: {
  children: ReactNode;
  siteName: string;
  nav?: NavItem[];
  homeHref?: string;
  badge?: string;
  logoutTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const logout = useLogout(logoutTo);
  useEffect(() => setOpen(false), [pathname]);

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center justify-between px-1">
        <Link href={homeHref} aria-label="Home">
          <Logo name={siteName} />
        </Link>
        {badge && <span className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-bg">{badge}</span>}
      </div>
      <nav aria-label="Dashboard" className="flex-1">
        <NavLinks items={nav} onNavigate={() => setOpen(false)} />
      </nav>
      <div className="space-y-3 border-t border-line pt-4">
        <ThemeToggle />
        <button onClick={logout} className="flex h-9 w-full items-center gap-3 rounded-[10px] px-3 text-[14px] text-ink-2 transition-colors hover:bg-surface/60 hover:text-ink">
          <LogOut className="size-4 text-ink-3" aria-hidden /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-bg-subtle lg:block">{sidebar}</aside>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-line bg-bg-subtle lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
            >
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 grid size-9 place-items-center rounded-lg text-ink-3">
                <X className="size-5" />
              </button>
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-md sm:px-6">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="grid size-10 place-items-center rounded-lg text-ink lg:hidden">
            <Menu className="size-5" />
          </button>
          <div className="flex flex-1 items-center justify-end gap-3">{!badge && <BalancePill />}</div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function BalancePill() {
  const { data } = useMe();
  const currency = useCurrency();
  return (
    <Link
      href="/dashboard/add-funds"
      className="flex h-10 items-center gap-2.5 rounded-full border border-line bg-surface pl-1.5 pr-4 shadow-1 transition-transform duration-200 hover:-translate-y-px active:translate-y-px"
    >
      <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-accent">
        <Wallet className="size-3.5" aria-hidden />
      </span>
      <span className="sr-only">Balance:</span>
      <span className="tabular text-[14px] font-semibold">{data ? formatMoney(data.balance, currency) : "—"}</span>
    </Link>
  );
}

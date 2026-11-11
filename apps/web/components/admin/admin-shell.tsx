"use client";

import {
  BadgePercent,
  Boxes,
  Coins,
  Crown,
  FileText,
  FolderTree,
  History,
  LayoutDashboard,
  ListOrdered,
  Server,
  Settings,
  Users,
} from "lucide-react";
import type { Permission } from "@smm/shared";
import { Shell, type NavItem } from "@/components/dashboard/shell";
import { useMe } from "@/lib/hooks/queries";

const nav: (NavItem & { perm?: Permission })[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, group: "Business" },
  { href: "/orders", label: "Orders", icon: ListOrdered, group: "Business", perm: "orders" },
  { href: "/users", label: "Users", icon: Users, group: "Business", perm: "users" },
  { href: "/providers", label: "Providers", icon: Server, group: "Catalog", perm: "catalog" },
  { href: "/services", label: "Services", icon: Boxes, group: "Catalog", perm: "catalog" },
  { href: "/categories", label: "Categories", icon: FolderTree, group: "Catalog", perm: "catalog" },
  { href: "/pricing", label: "Commission", icon: BadgePercent, group: "Pricing", perm: "pricing" },
  { href: "/vip", label: "VIP levels", icon: Crown, group: "Pricing", perm: "pricing" },
  { href: "/currencies", label: "Currencies", icon: Coins, group: "Configure", perm: "settings" },
  { href: "/content", label: "Pages & notices", icon: FileText, group: "Configure", perm: "content" },
  { href: "/settings", label: "Settings", icon: Settings, group: "Configure", perm: "settings" },
  { href: "/activity", label: "Activity log", icon: History, group: "Configure", perm: "logs" },
];

export function AdminShell({ children, siteName }: { children: React.ReactNode; siteName: string }) {
  const { data: me } = useMe();
  // Staff only see what they're allowed to use (the API enforces the same rules).
  const items = nav.filter((n) => !n.perm || !me || me.role === "admin" || (me.permissions ?? []).includes(n.perm));
  return (
    <Shell siteName={siteName} nav={items} homeHref="/" badge="Admin" logoutTo="/login">
      {children}
    </Shell>
  );
}

"use client";

import { BadgePercent, Boxes, FolderTree, LayoutDashboard, ListOrdered, Server, Settings, Users } from "lucide-react";
import { Shell, type NavItem } from "@/components/dashboard/shell";

const nav: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ListOrdered },
  { href: "/pricing", label: "Commission", icon: BadgePercent },
  { href: "/providers", label: "Providers", icon: Server },
  { href: "/services", label: "Services", icon: Boxes },
  { href: "/categories", label: "Categories", icon: FolderTree },
  { href: "/users", label: "Users", icon: Users, soon: true },
  { href: "/settings", label: "Settings", icon: Settings, soon: true },
];

export function AdminShell({ children, siteName }: { children: React.ReactNode; siteName: string }) {
  return (
    <Shell siteName={siteName} nav={nav} homeHref="/" badge="Admin" logoutTo="/login">
      {children}
    </Shell>
  );
}

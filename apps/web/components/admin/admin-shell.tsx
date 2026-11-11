"use client";

import { BadgePercent, Boxes, LayoutDashboard, Server, Settings, Users } from "lucide-react";
import { Shell, type NavItem } from "@/components/dashboard/shell";

const nav: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/pricing", label: "Commission", icon: BadgePercent },
  { href: "/services", label: "Services", icon: Boxes, soon: true },
  { href: "/providers", label: "Providers", icon: Server, soon: true },
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

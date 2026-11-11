import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { getPublicSettings } from "@/lib/server-api";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getPublicSettings();
  return <AdminShell siteName={s["site.name"]}>{children}</AdminShell>;
}

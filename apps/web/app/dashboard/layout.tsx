import type { Metadata } from "next";
import { Shell } from "@/components/dashboard/shell";
import { getPublicSettings } from "@/lib/server-api";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const s = await getPublicSettings();
  return <Shell siteName={s["site.name"]}>{children}</Shell>;
}

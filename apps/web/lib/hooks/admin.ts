"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AdminProvider {
  id: number;
  name: string;
  apiUrl: string;
  driver: "v2" | "custom";
  driverConfig: Record<string, unknown> | null;
  markup: string | null;
  status: "active" | "disabled";
  balance: string | null;
  currency: string;
  lowBalanceAlert: string | null;
  syncEnabled: boolean;
  syncIntervalMin: number;
  lastSyncAt: string | null;
  errorCount: number;
  lastError: string | null;
  keyHint: string;
  serviceCount: number;
}

export interface AdminCategory {
  id: number;
  name: string;
  slug: string;
  platform: string;
  description: string | null;
  markup: string | null;
  sort: number;
  status: "active" | "disabled";
  serviceCount: number;
  activeCount: number;
}

export const useProviders = () => useQuery({ queryKey: ["admin", "providers"], queryFn: () => api<AdminProvider[]>("/admin/providers") });
export const useCategories = () => useQuery({ queryKey: ["admin", "categories"], queryFn: () => api<AdminCategory[]>("/admin/categories") });

export function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

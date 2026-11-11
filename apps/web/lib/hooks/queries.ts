"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Currency } from "@/lib/format";
import type { CatalogCategory } from "@/components/services/services-table";

export interface Me {
  id: number;
  username: string;
  email: string;
  name: string | null;
  role: "user" | "staff" | "admin";
  permissions: string[] | null;
  balance: string;
  spent: string;
  currency: string;
  timezone: string;
  emailVerified: boolean;
  referralCode: string;
  createdAt: string;
  tier: { id: number; name: string; color: string } | null;
  discount: string | null;
}

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me"), staleTime: 15_000 });

export const useCurrencies = () =>
  useQuery({ queryKey: ["currencies"], queryFn: () => api<Currency[]>("/currencies"), staleTime: 10 * 60_000 });

/** The user's chosen display currency (falls back to USD). */
export function useCurrency() {
  const me = useMe();
  const list = useCurrencies();
  return list.data?.find((c) => c.code === me.data?.currency) ?? list.data?.find((c) => c.code === "USD") ?? null;
}

export const useCatalog = () =>
  useQuery({ queryKey: ["catalog"], queryFn: () => api<CatalogCategory[]>("/services"), staleTime: 60_000 });

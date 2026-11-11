"use client";

import { useDeferredValue, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { UserSheet } from "./user-sheet";

interface UserRow {
  id: number;
  username: string;
  email: string;
  role: "user" | "staff" | "admin";
  status: "active" | "banned";
  balance: string;
  spent: string;
  tierName: string | null;
  tierColor: string | null;
  emailVerified: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export function UsersAdmin() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const q = useDeferredValue(query.trim());
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (filter === "banned") params.set("status", "banned");
  if (filter === "staff" || filter === "admin") params.set("role", filter);

  const list = useInfiniteQuery({
    queryKey: ["admin", "users", params.toString()],
    queryFn: ({ pageParam }) => api<{ items: UserRow[]; nextCursor: number | null }>(`/admin/users?${params}${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: 0,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader title="Users" description="Search customers, adjust balances, set discounts and manage staff." />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px]">
        <label className="relative">
          <span className="sr-only">Search users</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Email, username or user ID"
            className="h-10 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-[14px] shadow-1 focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
          />
        </label>
        <Select aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Everyone</option>
          <option value="staff">Staff</option>
          <option value="admin">Admins</option>
          <option value="banned">Banned</option>
        </Select>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[14px]">
            <thead className="border-b border-line bg-surface-2 text-[12px] text-ink-3">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-2 py-3 font-medium">Status</th>
                <th className="px-2 py-3 font-medium">VIP</th>
                <th className="px-2 py-3 text-right font-medium">Balance</th>
                <th className="px-2 py-3 text-right font-medium">Spent</th>
                <th className="px-4 py-3 text-right font-medium">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading &&
                [0, 1, 2].map((i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
                      <Skeleton className="h-9" />
                    </td>
                  </tr>
                ))}
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-line transition-colors last:border-0 hover:bg-bg-subtle/60">
                  <td className="px-4 py-3">
                    <button onClick={() => setOpen(u.id)} className="text-left font-medium hover:text-accent hover:underline">
                      {u.username}
                    </button>
                    <p className="text-[12.5px] text-ink-3">
                      {u.email} · #{u.id}
                    </p>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.status === "banned" ? <Badge tone="danger">Banned</Badge> : <Badge tone="success">Active</Badge>}
                      {u.role !== "user" && <Badge tone="accent">{u.role === "admin" ? "Admin" : "Staff"}</Badge>}
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    {u.tierName ? (
                      <span className="inline-flex items-center gap-1.5 text-[13px]">
                        <span className="size-2 rounded-full" style={{ background: u.tierColor ?? undefined }} aria-hidden />
                        {u.tierName}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="tabular px-2 py-3 text-right font-mono text-[13px]">${Number(u.balance).toFixed(2)}</td>
                  <td className="tabular px-2 py-3 text-right font-mono text-[13px] text-ink-3">${Number(u.spent).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-[13px] text-ink-3">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.isLoading && rows.length === 0 && (
          <div className="grid place-items-center px-6 py-14 text-center">
            <Users className="size-6 text-ink-3" aria-hidden />
            <p className="mt-3 font-medium">No users found</p>
            <p className="mt-1 text-sm text-ink-3">Search by the start of an email or username.</p>
          </div>
        )}
        {list.hasNextPage && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="secondary" size="sm" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </div>
      {open !== null && <UserSheet key={open} userId={open} onClose={() => setOpen(null)} />}
    </>
  );
}

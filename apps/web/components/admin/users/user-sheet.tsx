"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, LogOut, Minus, Percent, Plus, ShieldCheck } from "lucide-react";
import { PERMISSIONS } from "@smm/shared";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/dashboard/page-header";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/hooks/queries";
import { cn } from "@/lib/cn";

interface UserDetail {
  id: number;
  username: string;
  email: string;
  name: string | null;
  role: "user" | "staff" | "admin";
  permissions: string[] | null;
  status: "active" | "banned";
  banReason: string | null;
  balance: string;
  spent: string;
  currency: string;
  vipTierId: number | null;
  vipLocked: boolean;
  customDiscount: string | null;
  apiEnabled: boolean;
  notes: string | null;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  stats: { orders: number; activeOrders: number; referrals: number };
  transactions: { id: number; type: string; amount: string; balanceAfter: string; note: string | null; createdAt: string }[];
  logins: { id: number; ip: string | null; success: boolean; createdAt: string; userAgent: string | null }[];
}
interface Tier {
  id: number;
  name: string;
}

const usd = (v: string) => `$${Number(v).toFixed(2)}`;

export function UserSheet({ userId, onClose }: { userId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  const { data: u, isLoading } = useQuery({ queryKey: ["admin", "user", userId], queryFn: () => api<UserDetail>(`/admin/users/${userId}`) });
  const tiers = useQuery({ queryKey: ["admin", "vip"], queryFn: () => api<Tier[]>("/admin/vip-tiers") });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "user", userId] });
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
  };
  const fail = (e: unknown) => toast(e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0]! : e.message) : "Something went wrong", "danger");

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const balance = useMutation({
    mutationFn: (action: "add" | "deduct") => api<{ balance: string }>(`/admin/users/${userId}/balance`, { method: "POST", json: { action, amount, note: note || undefined } }),
    onSuccess: (r, action) => {
      toast(`${action === "add" ? "Added" : "Deducted"} $${amount}. New balance ${usd(r.balance)}.`);
      setAmount("");
      setNote("");
      refresh();
    },
    onError: fail,
  });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/admin/users/${userId}`, { method: "PATCH", json: body }),
    onSuccess: () => {
      toast("Saved");
      refresh();
    },
    onError: fail,
  });
  const role = useMutation({
    mutationFn: (body: { role: string; permissions: string[] }) => api(`/admin/users/${userId}/role`, { method: "PUT", json: body }),
    onSuccess: () => {
      toast("Role updated");
      refresh();
    },
    onError: fail,
  });
  const impersonate = useMutation({
    mutationFn: () => api<{ url: string }>(`/admin/users/${userId}/impersonate`, { method: "POST" }),
    onSuccess: (r) => window.open(r.url, "_blank", "noopener"),
    onError: fail,
  });
  const logoutAll = useMutation({
    mutationFn: () => api(`/admin/users/${userId}/logout-all`, { method: "POST" }),
    onSuccess: () => toast("Signed out of every device"),
    onError: fail,
  });

  const [banReason, setBanReason] = useState("");
  const [perms, setPerms] = useState<string[] | null>(null);
  const currentPerms = perms ?? u?.permissions ?? [];

  return (
    <Dialog open onClose={onClose} variant="sheet" title={u ? u.username : "User"} description={u ? `${u.email} · joined ${new Date(u.createdAt).toLocaleDateString()}` : undefined}>
      {isLoading || !u ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-6">
          <div className="flex flex-wrap gap-1.5">
            {u.status === "banned" ? <Badge tone="danger">Banned</Badge> : <Badge tone="success">Active</Badge>}
            {u.role !== "user" && <Badge tone="accent">{u.role === "admin" ? "Admin" : "Staff"}</Badge>}
            {!u.emailVerifiedAt && <Badge tone="warning">Email not confirmed</Badge>}
            {!u.apiEnabled && <Badge>API off</Badge>}
          </div>

          <dl className="grid grid-cols-3 gap-3 rounded-xl border border-line p-4 text-[13px]">
            {[
              ["Balance", usd(u.balance)],
              ["Spent", usd(u.spent)],
              ["Orders", `${u.stats.orders} (${u.stats.activeOrders} active)`],
              ["Referrals", String(u.stats.referrals)],
              ["Last sign-in", u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"],
              ["Last IP", u.lastLoginIp ?? "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-ink-3">{k}</dt>
                <dd className="tabular mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
          </dl>

          <section>
            <h3 className="text-[14px] font-semibold">Adjust balance</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
              <Field label="Amount (USD)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="10.00" />
              <Field label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Bank transfer #1234" />
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled={!amount} loading={balance.isPending && balance.variables === "add"} onClick={() => balance.mutate("add")}>
                <Plus className="size-3.5" aria-hidden /> Add funds
              </Button>
              <Button size="sm" variant="secondary" disabled={!amount} loading={balance.isPending && balance.variables === "deduct"} onClick={() => balance.mutate("deduct")}>
                <Minus className="size-3.5" aria-hidden /> Deduct
              </Button>
            </div>
          </section>

          <section className="grid gap-4">
            <h3 className="text-[14px] font-semibold">Pricing</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="VIP level"
                value={u.vipTierId ?? ""}
                onChange={(e) => patch.mutate({ vipTierId: e.target.value ? Number(e.target.value) : null, vipLocked: true })}
                hint={u.vipLocked ? "Set manually (won't change with spend)" : "Follows lifetime spend"}
              >
                <option value="">None</option>
                {(tiers.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = String(new FormData(e.currentTarget).get("disc") ?? "");
                  patch.mutate({ customDiscount: v === "" ? null : v });
                }}
                className="relative"
              >
                <Field
                  name="disc"
                  label="Personal discount"
                  inputMode="decimal"
                  defaultValue={u.customDiscount ? String(Number(u.customDiscount)) : ""}
                  placeholder="None"
                  hint="Overrides the VIP discount. Press Enter to save."
                />
                <Percent className="pointer-events-none absolute right-3 top-[38px] size-3.5 text-ink-3" aria-hidden />
              </form>
            </div>
            {u.vipLocked && (
              <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => patch.mutate({ vipLocked: false })}>
                Let VIP level follow spend again
              </Button>
            )}
          </section>

          <section className="grid gap-4 rounded-xl border border-line p-4">
            <Switch checked={u.apiEnabled} onChange={(v) => patch.mutate({ apiEnabled: v })} label="API access" description="Lets this customer use the reseller API." />
            <Switch checked={Boolean(u.emailVerifiedAt)} onChange={(v) => patch.mutate({ emailVerified: v })} label="Email confirmed" />
          </section>

          <section>
            <h3 className="text-[14px] font-semibold">Notes</h3>
            <textarea
              aria-label="Private notes about this user"
              defaultValue={u.notes ?? ""}
              rows={3}
              onBlur={(e) => e.target.value !== (u.notes ?? "") && patch.mutate({ notes: e.target.value || null })}
              placeholder="Only staff can see these. Saves when you click away."
              className="mt-2 w-full rounded-[11px] border border-line bg-surface p-3 text-[14px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
            />
          </section>

          {isAdmin && (
            <section className="grid gap-3">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                <ShieldCheck className="size-4 text-ink-3" aria-hidden /> Role
              </h3>
              <Select aria-label="Role" value={u.role} onChange={(e) => role.mutate({ role: e.target.value, permissions: currentPerms })}>
                <option value="user">Customer</option>
                <option value="staff">Staff (limited admin access)</option>
                <option value="admin">Admin (full access)</option>
              </Select>
              {u.role === "staff" && (
                <fieldset className="grid gap-2 rounded-xl border border-line p-4">
                  <legend className="px-1 text-[13px] font-medium text-ink-2">Staff can access</legend>
                  {PERMISSIONS.map((p) => (
                    <label key={p.value} className="flex items-center gap-2.5 text-[14px]">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--accent)]"
                        checked={currentPerms.includes(p.value)}
                        onChange={(e) => setPerms(e.target.checked ? [...currentPerms, p.value] : currentPerms.filter((x) => x !== p.value))}
                      />
                      {p.label}
                    </label>
                  ))}
                  <Button size="sm" className="mt-1 justify-self-start" loading={role.isPending} disabled={perms === null} onClick={() => role.mutate({ role: "staff", permissions: currentPerms })}>
                    Save permissions
                  </Button>
                </fieldset>
              )}
            </section>
          )}

          <section className="grid gap-2">
            <h3 className="text-[14px] font-semibold">Account</h3>
            <div className="flex flex-wrap gap-2">
              {isAdmin && u.status === "active" && (
                <Button variant="secondary" size="sm" loading={impersonate.isPending} onClick={() => impersonate.mutate()}>
                  <ExternalLink className="size-3.5" aria-hidden /> Sign in as {u.username}
                </Button>
              )}
              <Button variant="ghost" size="sm" loading={logoutAll.isPending} onClick={() => logoutAll.mutate()}>
                <LogOut className="size-3.5" aria-hidden /> Sign out everywhere
              </Button>
            </div>
            {u.status === "active" ? (
              <div className="mt-2 grid gap-2 rounded-xl border border-danger/25 p-4">
                <Field label="Ban reason (shown to the user)" value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="e.g. Chargeback on payment #123" />
                <Button variant="danger" size="sm" className="justify-self-start" loading={patch.isPending} onClick={() => patch.mutate({ status: "banned", banReason: banReason || null })}>
                  Ban and sign out
                </Button>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
                <span className="flex-1">Banned{u.banReason ? `: ${u.banReason}` : ""}</span>
                <Button variant="secondary" size="sm" onClick={() => patch.mutate({ status: "active" })}>
                  Unban
                </Button>
              </div>
            )}
          </section>

          <section>
            <h3 className="text-[14px] font-semibold">Balance history</h3>
            {u.transactions.length ? (
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-[13px]">
                {u.transactions.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate">{t.note ?? t.type.replace(/_/g, " ")}</span>
                      <span className="text-[12px] text-ink-3">{new Date(t.createdAt).toLocaleString()}</span>
                    </span>
                    <span className="text-right">
                      <span className={cn("tabular block font-mono font-medium", Number(t.amount) >= 0 ? "text-success" : "")}>
                        {Number(t.amount) >= 0 ? "+" : "−"}${Math.abs(Number(t.amount)).toFixed(4)}
                      </span>
                      <span className="tabular font-mono text-[12px] text-ink-3">{usd(t.balanceAfter)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-ink-3">No balance changes yet.</p>
            )}
          </section>

          <section>
            <h3 className="text-[14px] font-semibold">Recent sign-ins</h3>
            {u.logins.length ? (
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-[13px]">
                {u.logins.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="truncate">
                      {l.ip ?? "—"} <span className="text-ink-3">· {new Date(l.createdAt).toLocaleString()}</span>
                    </span>
                    {l.success ? <Badge tone="success">OK</Badge> : <Badge tone="danger">Failed</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-ink-3">No sign-ins recorded.</p>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}

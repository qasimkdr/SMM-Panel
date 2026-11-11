"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Copy, KeyRound, Laptop, Mail, ShieldCheck, ShieldOff } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormAlert } from "@/components/auth/form-alert";
import { PasswordField } from "@/components/auth/password-field";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";

interface SecurityData {
  twoFactorEnabled: boolean;
  recoveryCodesLeft: number;
  hasPassword: boolean;
  googleLinked: boolean;
  emailPrefs: { orders: boolean; tickets: boolean; news: boolean };
  sessions: { id: string; scope: string; ip: string | null; userAgent: string | null; createdAt: string; current: boolean }[];
  logins: { id: number; ip: string | null; userAgent: string | null; success: boolean; createdAt: string }[];
}

/** Short, human device label from a user-agent string. */
function device(ua: string | null) {
  if (!ua) return "Unknown device";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua) ? "Mac" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /curl|node|python/i.test(ua) ? "API client" : "Browser";
  return `${browser} on ${os}`;
}
const errText = (e: unknown) => (e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0]! : e.message) : null);

function RecoveryCodes({ codes }: { codes: string[] }) {
  const toast = useToast();
  return (
    <div className="rounded-xl border border-warning/30 bg-warning-soft p-4">
      <p className="text-[14px] font-medium text-warning">Save these recovery codes now. Each works once if you lose your phone. We won&apos;t show them again.</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-[14px] sm:grid-cols-4">
        {codes.map((c) => (
          <li key={c} className="rounded-lg bg-surface px-2.5 py-1.5 text-center">
            {c}
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        size="sm"
        className="mt-3"
        onClick={async () => {
          await navigator.clipboard.writeText(codes.join("\n"));
          toast("Recovery codes copied");
        }}
      >
        <Copy className="size-3.5" aria-hidden /> Copy codes
      </Button>
    </div>
  );
}

function TwoFactor({ data }: { data: SecurityData }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  useEffect(() => {
    if (setup) QRCode.toDataURL(setup.otpauth, { margin: 1, width: 200 }).then(setQr);
  }, [setup]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["security"] });

  const start = useMutation({ mutationFn: () => api<{ secret: string; otpauth: string }>("/security/2fa/setup", { method: "POST" }), onSuccess: setSetup });
  const enable = useMutation({
    mutationFn: () => api<{ recoveryCodes: string[] }>("/security/2fa/enable", { method: "POST", json: { code } }),
    onSuccess: (r) => {
      setCodes(r.recoveryCodes);
      setSetup(null);
      setCode("");
      toast("Two-factor sign-in is on");
      refresh();
    },
  });
  const disable = useMutation({
    mutationFn: () => api("/security/2fa/disable", { method: "POST", json: { password, code } }),
    onSuccess: () => {
      setPassword("");
      setCode("");
      toast("Two-factor sign-in is off");
      refresh();
    },
  });
  const regen = useMutation({ mutationFn: () => api<{ recoveryCodes: string[] }>("/security/2fa/recovery-codes", { method: "POST", json: { code } }), onSuccess: (r) => (setCodes(r.recoveryCodes), setCode(""), refresh()) });

  return (
    <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <ShieldCheck className="size-4 text-ink-3" aria-hidden /> Two-factor sign-in
          </h2>
          <p className="mt-1 text-[14px] text-ink-3">After your password, enter a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password).</p>
        </div>
        {data.twoFactorEnabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
      </div>

      {codes && (
        <div className="mt-4">
          <RecoveryCodes codes={codes} />
        </div>
      )}

      {!data.twoFactorEnabled && !setup && (
        <Button className="mt-4" loading={start.isPending} onClick={() => start.mutate()}>
          Turn on two-factor sign-in
        </Button>
      )}

      {setup && (
        <div className="mt-5 grid gap-5 sm:grid-cols-[200px_1fr] sm:items-start">
          <div className="rounded-xl border border-line bg-white p-2">{qr ? <img src={qr} alt="QR code for your authenticator app" width={184} height={184} /> : <Skeleton className="size-[184px]" />}</div>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              enable.mutate();
            }}
          >
            <p className="text-[14px] text-ink-2">1. Scan the code with your authenticator app, or enter this key:</p>
            <code className="break-all rounded-lg bg-bg-subtle px-3 py-2 font-mono text-[13px]">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
            <p className="text-[14px] text-ink-2">2. Enter the 6-digit code it shows:</p>
            <Field label="Code from the app" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className="max-w-[200px]" />
            <FormAlert message={errText(enable.error)} />
            <div className="flex gap-2">
              <Button type="submit" loading={enable.isPending} disabled={code.length !== 6}>
                Confirm and turn on
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {data.twoFactorEnabled && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-3 rounded-xl border border-line p-4">
            <p className="flex items-center gap-2 text-[14px] font-medium">
              <KeyRound className="size-4 text-ink-3" aria-hidden /> Recovery codes: {data.recoveryCodesLeft} left
            </p>
            <Field label="Current code from the app" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <FormAlert message={errText(regen.error)} />
            <Button variant="secondary" size="sm" className="justify-self-start" loading={regen.isPending} disabled={code.length !== 6} onClick={() => regen.mutate()}>
              Make new recovery codes
            </Button>
          </div>
          <form
            className="grid gap-3 rounded-xl border border-danger/25 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              disable.mutate();
            }}
          >
            <p className="flex items-center gap-2 text-[14px] font-medium">
              <ShieldOff className="size-4 text-ink-3" aria-hidden /> Turn off
            </p>
            <PasswordField label="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <Field label="Code or recovery code" value={code} onChange={(e) => setCode(e.target.value.trim())} />
            <FormAlert message={errText(disable.error)} />
            <Button type="submit" variant="danger" size="sm" className="justify-self-start" loading={disable.isPending} disabled={!password || code.length < 6}>
              Turn off two-factor
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}

export function SecurityPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["security"], queryFn: () => api<SecurityData>("/security") });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/security/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => (toast("Signed out of that device"), qc.invalidateQueries({ queryKey: ["security"] })),
  });
  const prefs = useMutation({
    mutationFn: (p: SecurityData["emailPrefs"]) => api("/security/email-prefs", { method: "PUT", json: p }),
    onSuccess: () => (toast("Email preferences saved"), qc.invalidateQueries({ queryKey: ["security"] })),
  });

  return (
    <>
      <PageHeader title="Security" description="Two-factor sign-in, where you're signed in, and which emails you get." />
      {isLoading || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-5 [&>*]:min-w-0">
          <TwoFactor data={data} />

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1 sm:p-6">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <Laptop className="size-4 text-ink-3" aria-hidden /> Signed-in devices
              </h2>
              <ul className="mt-3 divide-y divide-line">
                {data.sessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium">
                        {device(s.userAgent)} {s.scope === "admin" && <Badge className="ml-1">Admin</Badge>}
                      </span>
                      <span className="text-[12.5px] text-ink-3">
                        {s.ip ?? "—"} · since {new Date(s.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                    {s.current ? (
                      <Badge tone="success">This device</Badge>
                    ) : (
                      <Button variant="ghost" size="sm" loading={revoke.isPending && revoke.variables === s.id} onClick={() => revoke.mutate(s.id)}>
                        Sign out
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1 sm:p-6">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <Mail className="size-4 text-ink-3" aria-hidden /> Email notifications
              </h2>
              <div className="mt-4 grid gap-4">
                <Switch checked={data.emailPrefs.orders} onChange={(v) => prefs.mutate({ ...data.emailPrefs, orders: v })} label="Order updates" description="When an order completes, is partly delivered or is canceled." />
                <Switch checked={data.emailPrefs.tickets} onChange={(v) => prefs.mutate({ ...data.emailPrefs, tickets: v })} label="Support replies" description="When we answer one of your tickets." />
                <Switch checked={data.emailPrefs.news} onChange={(v) => prefs.mutate({ ...data.emailPrefs, news: v })} label="News and offers" description="New services and occasional discounts." />
              </div>
              <p className="mt-4 text-[13px] text-ink-3">Security emails (password reset, email confirmation) are always sent.</p>
            </section>
          </div>

          <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1 sm:p-6">
            <h2 className="text-[15px] font-semibold">Recent sign-ins</h2>
            <ul className="mt-3 divide-y divide-line text-[14px]">
              {data.logins.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate">
                    {device(l.userAgent)} <span className="text-ink-3">· {l.ip ?? "—"} · {new Date(l.createdAt).toLocaleString()}</span>
                  </span>
                  {l.success ? <Badge tone="success">Signed in</Badge> : <Badge tone="danger">Wrong password</Badge>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-ink-3">Don&apos;t recognise something? Change your password and sign out of other devices.</p>
          </section>
        </div>
      )}
    </>
  );
}

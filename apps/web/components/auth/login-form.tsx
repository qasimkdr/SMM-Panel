"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ShieldCheck } from "lucide-react";
import { loginSchema } from "@smm/shared";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { PasswordField } from "./password-field";
import { FormAlert } from "./form-alert";
import { useForm } from "./use-form";

const OAUTH_ERRORS: Record<string, string> = {
  google_off: "Google sign-in isn't turned on. Use your email and password.",
  google_state: "That Google sign-in expired. Please try again.",
  google_token: "Google didn't confirm the sign-in. Please try again.",
  google_profile: "We couldn't read your Google profile. Please try again.",
  google_unverified: "Your Google email isn't verified, so we can't use it to sign in.",
  google_error: "Google sign-in failed. Please try again or use your password.",
  signups_closed: "New sign-ups are closed right now.",
  banned: "This account is suspended. Contact support.",
};

/** Google "G" mark (brand asset, drawn inline — no external request). */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

export function GoogleButton({ label = "Continue with Google", next, refCode }: { label?: string; next?: string; refCode?: string | null }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    api<Record<string, unknown>>("/settings")
      .then((s) => setEnabled(s["auth.googleEnabled"] === true))
      .catch(() => null);
  }, []);
  if (!enabled) return null;
  const qs = new URLSearchParams({ ...(next ? { next } : {}), ...(refCode ? { ref: refCode } : {}) });
  return (
    <>
      <a
        href={`/api/auth/google?${qs}`}
        className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-[13px] border border-line-strong bg-surface text-[15px] font-medium shadow-1 transition-[transform,background-color] duration-200 hover:-translate-y-px hover:bg-surface-2 active:translate-y-px"
      >
        <GoogleMark /> {label}
      </a>
      <div className="flex items-center gap-3 text-[13px] text-ink-3" aria-hidden>
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}

export function LoginForm({ admin = false }: { admin?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const { errors, formError, pending, submit, setFormError } = useForm(loginSchema);
  const [challenge, setChallenge] = useState<string | null>(params.get("challenge"));
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const oauthError = params.get("error");
  useEffect(() => {
    if (oauthError) setFormError(OAUTH_ERRORS[oauthError] ?? "Sign-in failed. Please try again.");
  }, [oauthError, setFormError]);

  const goNext = () => {
    const next = params.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : admin ? "/" : "/dashboard");
    router.refresh();
  };

  async function verify() {
    setVerifying(true);
    setCodeError(null);
    try {
      await api("/auth/login/2fa", { method: "POST", json: { challenge, code } });
      goNext();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Couldn't check the code. Try again.";
      if (e instanceof ApiError && e.status === 401) {
        setChallenge(null);
        setFormError(msg);
      } else setCodeError(e instanceof ApiError && e.fields?.code ? (msg.startsWith("Too many") ? msg : e.fields.code) : msg);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {challenge ? (
        <motion.form
          key="2fa"
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length >= 6) verify();
          }}
        >
          <div className="flex items-start gap-3 rounded-xl bg-bg-subtle px-4 py-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
            <p className="text-[14px] text-ink-2">Enter the 6-digit code from your authenticator app. Lost your phone? Use one of your recovery codes.</p>
          </div>
          <Field
            label="Code"
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.trim().slice(0, 12))}
            error={codeError ?? undefined}
            placeholder="123456"
          />
          <Button type="submit" size="lg" loading={verifying} disabled={code.length < 6} className="w-full">
            Verify and sign in
          </Button>
          <button type="button" onClick={() => setChallenge(null)} className="text-[13px] text-ink-3 hover:text-ink">
            Use a different account
          </button>
        </motion.form>
      ) : (
        <motion.form
          key="password"
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            submit({ login: fd.get("login"), password: fd.get("password") }, async (values) => {
              const r = await api<{ twoFactorRequired?: boolean; challenge?: string }>("/auth/login", { method: "POST", json: values });
              if (r.twoFactorRequired && r.challenge) {
                setCode("");
                setChallenge(r.challenge);
                return;
              }
              goNext();
            });
          }}
        >
          {!admin && <GoogleButton next={params.get("next") ?? undefined} />}
          <FormAlert message={formError} />
          <Field name="login" label="Email or username" autoComplete="username" autoFocus error={errors.login} />
          <div className="grid gap-1.5">
            <PasswordField name="password" label="Password" autoComplete="current-password" error={errors.password} />
            {!admin && (
              <Link href="/forgot-password" className="justify-self-end text-[13px] text-ink-3 hover:text-ink">
                Forgot password?
              </Link>
            )}
          </div>
          <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
            Sign in
          </Button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { forgotPasswordSchema, resetPasswordSchema } from "@smm/shared";
import { api, ApiError } from "@/lib/api";
import { Button, buttonClass } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { PasswordField } from "./password-field";
import { FormAlert } from "./form-alert";
import { useForm } from "./use-form";

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const { errors, formError, pending, submit } = useForm(forgotPasswordSchema);
  if (sent)
    return (
      <FormAlert tone="success" message="If an account uses that email, a reset link is on its way. Check your inbox and spam folder." />
    );
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit({ email: new FormData(e.currentTarget).get("email") }, async (v) => {
          await api("/auth/forgot-password", { method: "POST", json: v });
          setSent(true);
        });
      }}
    >
      <FormAlert message={formError} />
      <Field name="email" type="email" label="Email" autoComplete="email" autoFocus error={errors.email} />
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Send reset link
      </Button>
    </form>
  );
}

export function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState(false);
  const { errors, formError, pending, submit } = useForm(resetPasswordSchema);
  if (done)
    return (
      <div className="grid gap-4">
        <FormAlert tone="success" message="Password updated. You've been signed out of other devices." />
        <Link href="/login" className={buttonClass("primary", "lg", "w-full")}>
          Sign in
        </Link>
      </div>
    );
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit({ token, password: new FormData(e.currentTarget).get("password") }, async (v) => {
          await api("/auth/reset-password", { method: "POST", json: v });
          setDone(true);
        });
      }}
    >
      <FormAlert message={formError ?? (errors.token ? "This reset link is incomplete. Open it again from your email." : null)} />
      <PasswordField name="password" label="New password" autoComplete="new-password" autoFocus error={errors.password} hint="At least 8 characters." />
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Save new password
      </Button>
    </form>
  );
}

export function VerifyEmail() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    api("/auth/verify-email", { method: "POST", json: { token } })
      .then(() => setState("ok"))
      .catch((e) => {
        setState("error");
        setMessage(e instanceof ApiError ? e.message : "Can't reach the server. Try again.");
      });
  }, [token]);

  return (
    <div className="text-center">
      {state === "loading" && <Loader2 className="mx-auto size-7 animate-spin text-ink-3" aria-label="Checking link" />}
      {state === "ok" && <CheckCircle2 className="mx-auto size-8 text-success" aria-hidden />}
      {state === "error" && <XCircle className="mx-auto size-8 text-danger" aria-hidden />}
      <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.03em]">
        {state === "loading" ? "Confirming your email…" : state === "ok" ? "Email confirmed" : "Link didn't work"}
      </h1>
      <p className="mt-2 text-[15px] text-ink-3" role="status">
        {state === "ok" ? "Thanks! You can place orders now." : state === "error" ? message : " "}
      </p>
      {state !== "loading" && (
        <Link href="/dashboard" className={buttonClass("primary", "lg", "mt-6")}>
          Go to dashboard
        </Link>
      )}
    </div>
  );
}

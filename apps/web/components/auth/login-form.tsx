"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { loginSchema } from "@smm/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { PasswordField } from "./password-field";
import { FormAlert } from "./form-alert";
import { useForm } from "./use-form";

export function LoginForm({ admin = false }: { admin?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const { errors, formError, pending, submit } = useForm(loginSchema);

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        submit({ login: fd.get("login"), password: fd.get("password") }, async (values) => {
          await api("/auth/login", { method: "POST", json: values });
          const next = params.get("next");
          router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : admin ? "/" : "/dashboard");
          router.refresh();
        });
      }}
    >
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
    </form>
  );
}

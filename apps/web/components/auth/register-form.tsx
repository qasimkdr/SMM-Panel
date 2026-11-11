"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_CURRENCIES, registerSchema } from "@smm/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { PasswordField } from "./password-field";
import { GoogleButton } from "./login-form";
import { FormAlert } from "./form-alert";
import { useForm } from "./use-form";

/** Referral code saved by /r/[code] (valid 30 days), used if the sign-up link lost its ?ref. */
function storedRef(): string | undefined {
  try {
    const v = JSON.parse(localStorage.getItem("ref") ?? "null") as { code: string; at: number } | null;
    return v && Date.now() - v.at < 30 * 86_400_000 ? v.code : undefined;
  } catch {
    return undefined;
  }
}

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { errors, formError, pending, submit } = useForm(registerSchema);

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        submit(
          {
            username: fd.get("username"),
            email: fd.get("email"),
            password: fd.get("password"),
            currency: fd.get("currency"),
            referralCode: params.get("ref") ?? storedRef(),
            acceptTerms: fd.get("acceptTerms") === "on",
          },
          async (values) => {
            await api("/auth/register", { method: "POST", json: values });
            router.replace("/dashboard?welcome=1");
            router.refresh();
          },
        );
      }}
    >
      <GoogleButton label="Sign up with Google" refCode={params.get("ref")} />
      <FormAlert message={formError} />
      <Field name="username" label="Username" autoComplete="username" autoFocus error={errors.username} hint="Letters, numbers and underscores." />
      <Field name="email" type="email" label="Email" autoComplete="email" error={errors.email} />
      <PasswordField name="password" label="Password" autoComplete="new-password" error={errors.password} hint="At least 8 characters." />
      <div className="grid gap-1.5">
        <label htmlFor="currency" className="text-[13px] font-medium text-ink-2">
          Currency
        </label>
        <select
          id="currency"
          name="currency"
          defaultValue="USD"
          className="h-11 rounded-[11px] border border-line bg-surface px-3 text-[15px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
        >
          {DEFAULT_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-start gap-2.5 text-[14px] text-ink-2">
        <input name="acceptTerms" type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" aria-invalid={errors.acceptTerms ? true : undefined} />
        <span>
          I agree to the{" "}
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/refund" className="underline underline-offset-2">
            Refund policy
          </Link>
        </span>
      </label>
      {errors.acceptTerms && (
        <p role="alert" className="-mt-2 text-[13px] text-danger">
          {errors.acceptTerms}
        </p>
      )}
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        Create account
      </Button>
    </form>
  );
}

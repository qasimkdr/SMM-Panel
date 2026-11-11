import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RegisterForm } from "@/components/auth/register-form";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = { title: "Create account", alternates: { canonical: "/register" } };

export default function RegisterPage() {
  return (
    <Reveal>
      <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Create your account</h1>
      <p className="mt-1.5 text-[15px] text-ink-3">Free to join. You only pay for what you order.</p>
      <div className="mt-8">
        <Suspense>
          <RegisterForm />
        </Suspense>
      </div>
      <p className="mt-6 text-center text-[14px] text-ink-3">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-ink underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </Reveal>
  );
}

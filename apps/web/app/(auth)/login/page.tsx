import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = { title: "Sign in", alternates: { canonical: "/login" } };

export default function LoginPage() {
  return (
    <Reveal>
      <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Welcome back</h1>
      <p className="mt-1.5 text-[15px] text-ink-3">Sign in to place orders and track them live.</p>
      <div className="mt-8">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
      <p className="mt-6 text-center text-[14px] text-ink-3">
        New here?{" "}
        <Link href="/register" className="font-medium text-ink underline-offset-2 hover:underline">
          Create an account
        </Link>
      </p>
    </Reveal>
  );
}

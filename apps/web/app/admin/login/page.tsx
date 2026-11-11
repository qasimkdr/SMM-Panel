import type { Metadata } from "next";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { LogoMark } from "@/components/ui/logo";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

export default function AdminLogin() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-bg-subtle px-4">
      <Reveal className="w-full max-w-[400px] rounded-[var(--radius-xl)] border border-line bg-surface p-8 shadow-3">
        <div className="flex items-center gap-3">
          <LogoMark />
          <span className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-bg">Admin</span>
        </div>
        <h1 className="mt-6 text-[24px] font-semibold tracking-[-0.03em]">Admin sign in</h1>
        <p className="mt-1 flex items-center gap-1.5 text-[14px] text-ink-3">
          <ShieldCheck className="size-4" aria-hidden /> Staff and admin accounts only.
        </p>
        <div className="mt-7">
          <Suspense>
            <LoginForm admin />
          </Suspense>
        </div>
      </Reveal>
    </main>
  );
}

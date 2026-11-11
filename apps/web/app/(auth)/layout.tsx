import Link from "next/link";
import { Camera, RotateCcw, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { TiltCard } from "@/components/ui/tilt-card";
import { getPublicSettings } from "@/lib/server-api";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const s = await getPublicSettings();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Link href="/" aria-label={`${s["site.name"]} home`} className="self-start">
          <Logo name={s["site.name"]} />
        </Link>
        <main id="main" className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">
          {children}
        </main>
        <p className="text-center text-xs text-ink-3 lg:text-left">
          By continuing you agree to our{" "}
          <Link className="underline underline-offset-2 hover:text-ink" href="/terms">
            Terms
          </Link>{" "}
          and{" "}
          <Link className="underline underline-offset-2 hover:text-ink" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </div>

      <aside aria-hidden className="relative hidden overflow-hidden border-l border-line bg-bg-subtle lg:block">
        <div className="absolute inset-0 [background-image:radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:22px_22px] opacity-60" />
        <div className="relative flex h-full flex-col items-center justify-center gap-6 p-12 [perspective:1200px]">
          <TiltCard max={8} className="w-full max-w-[380px] p-6 shadow-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-ink-3">Available balance</p>
              <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">Gold · 4% off</span>
            </div>
            <p className="depth-1 tabular mt-2 text-[36px] font-semibold tracking-[-0.03em]">$248.60</p>
            <div className="depth-2 mt-6 space-y-2">
              {[
                [Camera, "Followers · #48213", "In progress", "text-info"],
                [RotateCcw, "Refill · #48102", "Completed", "text-success"],
              ].map(([Icon, label, st, cls]) => {
                const I = Icon as typeof Camera;
                return (
                  <div key={label as string} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[13px]">
                    <I className="size-4 text-ink-3" />
                    <span className="flex-1 text-ink-2">{label as string}</span>
                    <span className={cls as string}>{st as string}</span>
                  </div>
                );
              })}
            </div>
          </TiltCard>
          <p className="flex items-center gap-2 text-sm text-ink-3">
            <ShieldCheck className="size-4" /> We never ask for your social media passwords.
          </p>
        </div>
      </aside>
    </div>
  );
}

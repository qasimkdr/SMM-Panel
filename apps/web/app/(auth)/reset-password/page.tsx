import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetForm } from "@/components/auth/recovery-forms";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function ResetPage() {
  return (
    <Reveal>
      <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Choose a new password</h1>
      <p className="mt-1.5 text-[15px] text-ink-3">You&apos;ll be signed out of other devices after saving.</p>
      <div className="mt-8">
        <Suspense>
          <ResetForm />
        </Suspense>
      </div>
    </Reveal>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "@/components/auth/recovery-forms";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPage() {
  return (
    <Reveal>
      <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Reset your password</h1>
      <p className="mt-1.5 text-[15px] text-ink-3">Enter your account email and we&apos;ll send you a link.</p>
      <div className="mt-8">
        <ForgotForm />
      </div>
      <p className="mt-6 text-center text-[14px] text-ink-3">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-ink hover:underline">
          Sign in
        </Link>
      </p>
    </Reveal>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmail } from "@/components/auth/recovery-forms";

export const metadata: Metadata = { title: "Confirm email", robots: { index: false } };

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}

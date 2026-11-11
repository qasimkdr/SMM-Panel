"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/** Referral link: counts the visit, remembers the code for 30 days, then sends the visitor to sign up. */
export default function ReferralRedirect() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  useEffect(() => {
    try {
      localStorage.setItem("ref", JSON.stringify({ code, at: Date.now() }));
    } catch {}
    fetch("/api/affiliates/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).finally(() =>
      router.replace(`/register?ref=${encodeURIComponent(code)}`),
    );
  }, [code, router]);
  return (
    <main className="grid min-h-dvh place-items-center">
      <Loader2 className="size-6 animate-spin text-ink-3" aria-label="Loading" />
    </main>
  );
}

"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, XCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { buttonClass } from "@/components/ui/button";

function Exchange() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    api("/auth/impersonate", { method: "POST", json: { token } })
      .then(() => {
        router.replace("/dashboard");
        router.refresh();
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't sign in. Try again from the admin panel."));
  }, [token, router]);

  return (
    <div className="text-center">
      {error ? <XCircle className="mx-auto size-8 text-danger" aria-hidden /> : <Loader2 className="mx-auto size-7 animate-spin text-ink-3" aria-hidden />}
      <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.02em]">{error ? "Link didn't work" : "Signing you in as the customer…"}</h1>
      <p className="mt-2 text-[15px] text-ink-3" role="status">
        {error ?? " "}
      </p>
      {error && (
        <Link href="/login" className={buttonClass("secondary", "md", "mt-5")}>
          Go to sign in
        </Link>
      )}
    </div>
  );
}

export default function ImpersonatePage() {
  return (
    <Suspense>
      <Exchange />
    </Suspense>
  );
}

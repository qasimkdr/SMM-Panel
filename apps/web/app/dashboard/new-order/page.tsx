"use client";

import { Suspense, useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { NewOrderForm } from "@/components/orders/new-order";
import { MassOrderForm } from "@/components/orders/mass-order";
import { cn } from "@/lib/cn";

export default function NewOrderPage() {
  const [tab, setTab] = useState<"single" | "mass">("single");
  return (
    <>
      <PageHeader
        title="New order"
        description="Choose a service, paste your link and set a quantity. You'll see the total before you pay."
        actions={
          <div role="tablist" aria-label="Order type" className="inline-flex rounded-xl bg-bg-subtle p-1">
            {(["single", "mass"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "h-9 rounded-lg px-4 text-[14px] font-medium transition-[background-color,box-shadow,color] duration-200",
                  tab === t ? "bg-surface text-ink shadow-1" : "text-ink-3 hover:text-ink",
                )}
              >
                {t === "single" ? "Single order" : "Mass order"}
              </button>
            ))}
          </div>
        }
      />
      {tab === "single" ? (
        <Suspense>
          <NewOrderForm />
        </Suspense>
      ) : (
        <MassOrderForm />
      )}
    </>
  );
}

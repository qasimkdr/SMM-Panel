import Link from "next/link";
import { ListOrdered } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { buttonClass } from "@/components/ui/button";

export default function OrdersPage() {
  return (
    <>
      <PageHeader title="Orders" description="Every order with live status, start count and what's left." />
      <div className="grid place-items-center rounded-[var(--radius-xl)] border border-dashed border-line-strong px-6 py-20 text-center">
        <ListOrdered className="size-7 text-ink-3" aria-hidden />
        <p className="mt-3 text-[17px] font-medium">No orders yet</p>
        <p className="mt-1 max-w-sm text-sm text-ink-3">When you place an order it shows up here and updates by itself.</p>
        <Link href="/dashboard/new-order" className={buttonClass("primary", "md", "mt-5")}>
          New order
        </Link>
      </div>
    </>
  );
}

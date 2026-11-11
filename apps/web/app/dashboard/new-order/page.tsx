import Link from "next/link";
import { CirclePlus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { buttonClass } from "@/components/ui/button";

export default function NewOrderPage() {
  return (
    <>
      <PageHeader title="New order" description="Choose a service, paste your link and set a quantity." />
      <div className="grid place-items-center rounded-[var(--radius-xl)] border border-dashed border-line-strong px-6 py-20 text-center">
        <CirclePlus className="size-7 text-ink-3" aria-hidden />
        <p className="mt-3 text-[17px] font-medium">Ordering opens with the next update</p>
        <p className="mt-1 max-w-sm text-sm text-ink-3">You can already browse every service and its price.</p>
        <Link href="/dashboard/services" className={buttonClass("secondary", "md", "mt-5")}>
          Browse services
        </Link>
      </div>
    </>
  );
}

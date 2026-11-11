import Link from "next/link";
import { ArrowUpRight, BadgePercent } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { TiltCard } from "@/components/ui/tilt-card";

export default function AdminHome() {
  return (
    <>
      <PageHeader title="Admin overview" description="Revenue, orders and provider health will appear here as features go live." />
      <Link href="/pricing" className="block max-w-md rounded-[var(--radius-lg)]">
        <TiltCard pressable className="p-6">
          <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
            <BadgePercent className="size-5" aria-hidden />
          </span>
          <h2 className="depth-1 mt-4 text-[17px] font-semibold">Commission</h2>
          <p className="mt-1 text-[14px] text-ink-3">Set your markup on provider services: global, per provider, per category or per service.</p>
          <span className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium text-accent">
            Open <ArrowUpRight className="size-4" aria-hidden />
          </span>
        </TiltCard>
      </Link>
    </>
  );
}

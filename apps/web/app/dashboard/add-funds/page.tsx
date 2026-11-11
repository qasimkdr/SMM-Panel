import { Wallet, MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { TiltCard } from "@/components/ui/tilt-card";

export default function AddFundsPage() {
  return (
    <>
      <PageHeader title="Add funds" />
      <TiltCard max={4} className="mx-auto max-w-xl overflow-hidden p-8 text-center sm:p-12">
        <div className="depth-2 mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent shadow-2">
          <Wallet className="size-6" aria-hidden />
        </div>
        <span className="mt-6 inline-block rounded-full border border-line bg-bg-subtle px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
          Coming soon
        </span>
        <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.02em]">Online payments are on the way</h2>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-ink-3">
          We&apos;re setting up card, crypto and local payment methods. Until then, our team can add balance to your account
          for you.
        </p>
        <p className="mt-6 inline-flex items-center gap-2 text-[14px] text-ink-2">
          <MessageSquare className="size-4" aria-hidden /> Contact support to top up your balance.
        </p>
      </TiltCard>
    </>
  );
}

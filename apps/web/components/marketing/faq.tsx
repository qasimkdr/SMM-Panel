import { Plus } from "lucide-react";

export const faqs = [
  {
    q: "How fast do orders start?",
    a: "Most services start within minutes. Each service shows its average completion time, calculated from real recent orders, so you know what to expect before you pay.",
  },
  {
    q: "What happens if an order doesn't fully deliver?",
    a: "If a provider delivers only part of an order, it's marked Partial and the undelivered amount goes back to your balance automatically. Canceled orders are refunded in full.",
  },
  {
    q: "What does a refill guarantee mean?",
    a: "Services marked Refill include a guarantee period (for example 30 days). If the count drops during that time, press Refill on the order and we top it back up at no cost.",
  },
  {
    q: "Can I pay in my own currency?",
    a: "You can view prices and your balance in USD, EUR, GBP, PKR, INR and other currencies. Pick yours in account settings at any time.",
  },
  {
    q: "Do you have an API for resellers?",
    a: "Yes. The API follows the standard v2 format most panels use, so you can connect it to your own panel by pasting the URL and your key.",
  },
  {
    q: "Do I need to share my password?",
    a: "Never. We only need the public link or username of the post or profile. We will never ask for your social media login.",
  },
];

export function Faq() {
  return (
    <div className="divide-y divide-line rounded-[var(--radius-xl)] border border-line bg-surface">
      {faqs.map((f) => (
        <details key={f.q} className="group px-5 sm:px-6 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[15px] font-medium">
            {f.q}
            <Plus className="size-4 shrink-0 text-ink-3 transition-transform duration-300 group-open:rotate-45" aria-hidden />
          </summary>
          <p className="-mt-1 pb-5 pr-8 text-[15px] leading-relaxed text-ink-3">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

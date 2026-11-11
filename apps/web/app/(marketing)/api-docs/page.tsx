import type { Metadata } from "next";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: "API documentation",
  description: "Standard API v2 for resellers: services, add order, status, multi-status, refill, cancel and balance.",
  alternates: { canonical: "/api-docs" },
};

const actions = [
  { action: "services", params: "key", returns: '[{ "service": 1, "name": "…", "type": "Default", "category": "…", "rate": "0.90", "min": "50", "max": "10000", "refill": true, "cancel": true }]' },
  { action: "add", params: "key, service, link, quantity (+ runs, interval, comments… by type)", returns: '{ "order": 23501 }' },
  { action: "status", params: "key, order", returns: '{ "charge": "0.27819", "start_count": "3572", "status": "Partial", "remains": "157", "currency": "USD" }' },
  { action: "status", params: "key, orders (comma-separated, up to 100)", returns: '{ "1": { … }, "10": { "error": "Incorrect order ID" } }' },
  { action: "refill", params: "key, order", returns: '{ "refill": "1" }' },
  { action: "refill_status", params: "key, refill", returns: '{ "status": "Completed" }' },
  { action: "cancel", params: "key, orders", returns: '[{ "order": 9, "cancel": 1 }]' },
  { action: "balance", params: "key", returns: '{ "balance": "100.84292", "currency": "USD" }' },
];

export default function ApiDocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">Developers</p>
        <h1 className="mt-3 text-[clamp(2rem,4vw,2.8rem)] font-semibold tracking-[-0.03em]">API v2</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-3">
          Send <code className="font-mono text-ink-2">POST</code> requests with form data. Your key is in{" "}
          <span className="text-ink-2">Dashboard → Account → API</span>.
        </p>
      </Reveal>
      <div className="mt-8 grid gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-5 font-mono text-[13px] sm:grid-cols-[140px_1fr]">
        <span className="text-ink-3">Endpoint</span>
        <span className="break-all">{(process.env.WEB_URL ?? "https://yourpanel.com") + "/api/v2"}</span>
        <span className="text-ink-3">Method</span>
        <span>POST</span>
        <span className="text-ink-3">Response</span>
        <span>JSON</span>
      </div>
      <div className="mt-10 space-y-4">
        {actions.map((a, i) => (
          <Reveal key={i} delay={i * 0.03}>
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-5 py-3.5">
                <code className="font-mono text-[14px] font-semibold text-accent">action={a.action}</code>
                <span className="text-[13px] text-ink-3">{a.params}</span>
              </div>
              <pre className="overflow-x-auto bg-surface-2 px-5 py-4 font-mono text-[12.5px] leading-relaxed text-ink-2">{a.returns}</pre>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

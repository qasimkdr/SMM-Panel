import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Code2,
  Coins,
  Gauge,
  Layers,
  ListChecks,
  RotateCcw,
  Search,
  Wallet,
  Zap,
} from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { TiltCard } from "@/components/ui/tilt-card";
import { Reveal, Stagger, StaggerItem } from "@/components/ui/reveal";
import { HeroScene } from "@/components/marketing/hero-scene";
import { PlatformMarquee } from "@/components/marketing/platform-marquee";
import { Faq, faqs } from "@/components/marketing/faq";
import { getPublicSettings } from "@/lib/server-api";

export const revalidate = 300;

const steps = [
  { icon: Search, title: "Pick a service", body: "Filter by platform, see the price per 1,000, the start time and whether refills are included." },
  { icon: ListChecks, title: "Paste your link", body: "Add the post or profile link and a quantity. The total updates as you type." },
  { icon: Gauge, title: "Watch it move", body: "Your order updates live: start count, progress and what's left, without refreshing." },
  { icon: RotateCcw, title: "Refill if it drops", body: "On refill-backed services, one button tops the count back up during the guarantee." },
];

export default async function HomePage() {
  const s = await getPublicSettings();
  const name = s["site.name"];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name, url: process.env.WEB_URL ?? "http://localhost:3000" },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-size:56px_56px] opacity-50 [mask-image:radial-gradient(ellipse_70%_60%_at_70%_40%,#000,transparent)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:pb-24">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-ink-2 shadow-1">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-success" />
                </span>
                Live order tracking on every service
              </span>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="mt-6 text-[clamp(2.4rem,5.6vw,4.1rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-balance">
                Social growth that <span className="text-accent">shows its work.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 max-w-[34rem] text-[17px] leading-relaxed text-ink-2 text-pretty">
                Order followers, views and engagement for 12+ platforms. Every order is tracked from start count to
                completion, and refill-backed services are topped up when counts drop.
              </p>
            </Reveal>
            <Reveal delay={0.24} className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className={buttonClass("primary", "lg")}>
                Create free account <ArrowRight className="size-4" />
              </Link>
              <Link href="/services" className={buttonClass("secondary", "lg")}>
                Browse services
              </Link>
            </Reveal>
            <Reveal delay={0.32}>
              <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-3">
                {[
                  [Coins, "No monthly fees"],
                  [BadgeCheck, "Refill-backed services"],
                  [Code2, "API for resellers"],
                ].map(([Icon, label]) => {
                  const I = Icon as typeof Coins;
                  return (
                    <li key={label as string} className="flex items-center gap-2">
                      <I className="size-4 text-ink-2" aria-hidden /> {label as string}
                    </li>
                  );
                })}
              </ul>
            </Reveal>
          </div>
          <HeroScene />
        </div>
      </section>

      <PlatformMarquee />

      {/* ── How it works: timeline, not a card row ── */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
        <Reveal className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">How an order moves</p>
          <h2 className="mt-3 text-[clamp(1.8rem,3.6vw,2.6rem)] font-semibold leading-tight tracking-[-0.03em] text-balance">
            From link to delivered, with nothing hidden in between.
          </h2>
        </Reveal>
        <Stagger className="relative mt-14 grid gap-5 md:grid-cols-4">
          <div aria-hidden className="absolute left-0 right-0 top-[26px] hidden h-px bg-gradient-to-r from-transparent via-line-strong to-transparent md:block" />
          {steps.map((st, i) => (
            <StaggerItem key={st.title} className="relative">
              <div className="relative z-10 mb-5 flex items-center gap-3">
                <span className="grid size-[52px] place-items-center rounded-2xl border border-line bg-surface shadow-2">
                  <st.icon className="size-5 text-ink" aria-hidden />
                </span>
                <span className="font-mono text-xs text-ink-3">0{i + 1}</span>
              </div>
              <h3 className="text-[17px] font-semibold tracking-tight">{st.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-3">{st.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ── Bento ── */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Stagger className="grid auto-rows-[minmax(220px,auto)] gap-4 md:grid-cols-6">
          <StaggerItem className="md:col-span-4">
            <TiltCard max={4} className="h-full overflow-hidden p-6 sm:p-8">
              <div className="flex h-full flex-col justify-between gap-8 sm:flex-row">
                <div className="max-w-xs">
                  <Zap className="size-5 text-accent" aria-hidden />
                  <h3 className="mt-4 text-xl font-semibold tracking-tight">Live status on every order</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-3">
                    Statuses update in real time. Partial orders refund the difference to your balance automatically.
                  </p>
                </div>
                <ul className="depth-1 w-full max-w-[280px] space-y-2 self-end">
                  {[
                    ["#48213", "In progress", "info"],
                    ["#48207", "Completed", "success"],
                    ["#48199", "Partial · refunded $0.60", "warning"],
                  ].map(([id, st, tone]) => (
                    <li key={id} className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[13px]">
                      <span className="font-mono text-ink-3">{id}</span>
                      <span
                        className={
                          tone === "info" ? "text-info" : tone === "success" ? "text-success" : "text-warning"
                        }
                      >
                        {st}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </TiltCard>
          </StaggerItem>
          <StaggerItem className="md:col-span-2">
            <TiltCard className="h-full p-6 sm:p-8">
              <Wallet className="size-5 text-accent" aria-hidden />
              <h3 className="mt-4 text-xl font-semibold tracking-tight">Your currency</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-3">See prices and balance the way you think about money.</p>
              <div className="depth-1 mt-6 flex flex-wrap gap-1.5">
                {["USD", "EUR", "GBP", "PKR", "INR", "AED", "TRY", "BRL"].map((c) => (
                  <span key={c} className="rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[12px] text-ink-2">
                    {c}
                  </span>
                ))}
              </div>
            </TiltCard>
          </StaggerItem>
          <StaggerItem className="md:col-span-2">
            <TiltCard className="h-full p-6 sm:p-8">
              <Layers className="size-5 text-accent" aria-hidden />
              <h3 className="mt-4 text-xl font-semibold tracking-tight">Prices that drop as you grow</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-3">VIP levels unlock automatically as your total spend goes up.</p>
              <div className="depth-1 mt-6 space-y-1.5 text-[13px]">
                {[
                  ["Silver", "2% off"],
                  ["Gold", "4% off"],
                  ["Platinum", "6% off"],
                ].map(([t, d]) => (
                  <div key={t} className="flex justify-between border-b border-dashed border-line pb-1.5 last:border-0">
                    <span className="text-ink-2">{t}</span>
                    <span className="font-mono text-ink">{d}</span>
                  </div>
                ))}
              </div>
            </TiltCard>
          </StaggerItem>
          <StaggerItem className="md:col-span-4">
            <TiltCard max={4} className="h-full overflow-hidden bg-ink p-6 text-bg sm:p-8 dark:bg-surface-2 dark:text-ink">
              <div className="grid h-full gap-6 sm:grid-cols-[1fr_1.2fr] sm:items-center">
                <div>
                  <Code2 className="size-5 text-accent" aria-hidden />
                  <h3 className="mt-4 text-xl font-semibold tracking-tight">Standard API v2</h3>
                  <p className="mt-2 text-[15px] leading-relaxed opacity-70">
                    Connect your own panel in minutes. Same actions and fields most panels already speak.
                  </p>
                  <Link href="/api-docs" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
                    Read the API docs <ArrowRight className="size-3.5" />
                  </Link>
                </div>
                <pre className="depth-1 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-[12px] leading-relaxed text-white/80 dark:border-line">
{`POST /api/v2
key=YOUR_KEY
action=add
service=101
link=https://…
quantity=2500

→ { "order": 48213 }`}
                </pre>
              </div>
            </TiltCard>
          </StaggerItem>
        </Stagger>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="mx-auto grid max-w-6xl scroll-mt-20 gap-10 px-4 pb-24 sm:px-6 lg:grid-cols-[1fr_1.6fr]">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">Questions</p>
          <h2 className="mt-3 text-[clamp(1.8rem,3.6vw,2.6rem)] font-semibold leading-tight tracking-[-0.03em]">Before you order</h2>
          <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-ink-3">
            Can&apos;t find an answer? Open a support ticket from your dashboard and we&apos;ll reply there.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <Faq />
        </Reveal>
      </section>

      {/* ── CTA ── */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Reveal>
          <TiltCard max={3} className="overflow-hidden border-accent-line bg-accent-soft p-8 sm:p-12">
            <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div>
                <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-semibold tracking-[-0.03em]">Ready when you are.</h2>
                <p className="mt-2 max-w-md text-[15px] text-ink-2">Create an account in under a minute and browse every service with live prices.</p>
              </div>
              <Link href="/register" className={buttonClass("primary", "lg", "depth-1")}>
                Create free account <ArrowRight className="size-4" />
              </Link>
            </div>
          </TiltCard>
        </Reveal>
      </section>
    </>
  );
}

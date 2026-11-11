import type { Metadata } from "next";
import { ServicesTable, type CatalogCategory } from "@/components/services/services-table";
import { Reveal } from "@/components/ui/reveal";
import { serverGet } from "@/lib/server-api";

export const revalidate = 120; // ISR: rebuilt in the background at most every 2 minutes

export const metadata: Metadata = {
  title: "Services and prices",
  description: "Every service with live prices per 1,000, minimum and maximum order sizes, refill guarantees and average start times.",
  alternates: { canonical: "/services" },
};

export default async function ServicesPage() {
  const catalog = await serverGet<CatalogCategory[]>("/services", [], revalidate);
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">Catalog</p>
        <h1 className="mt-3 text-[clamp(2rem,4vw,2.8rem)] font-semibold tracking-[-0.03em]">Services and prices</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-3">
          Prices are per 1,000 and shown in USD. Sign in to see prices in your currency and any VIP discount.
        </p>
      </Reveal>
      <div className="mt-10">
        <ServicesTable catalog={catalog} />
      </div>
    </div>
  );
}

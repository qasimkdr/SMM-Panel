import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Markdown } from "@/lib/markdown";
import { serverGet } from "@/lib/server-api";

interface Page {
  slug: string;
  title: string;
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  updatedAt: string;
}

const load = (slug: string) => serverGet<Page | null>(`/pages/${slug}`, null, 300);

export async function legalMetadata(slug: string): Promise<Metadata> {
  const p = await load(slug);
  return { title: p?.metaTitle || p?.title || slug, description: p?.metaDescription ?? undefined, alternates: { canonical: `/${slug}` } };
}

/** Admin-editable page (Terms, Privacy, Refund) rendered on the public site with ISR. */
export async function LegalPage({ slug }: { slug: string }) {
  const p = await load(slug);
  if (!p) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">Legal</p>
      <h1 className="mt-3 text-[clamp(2rem,4vw,2.6rem)] font-semibold tracking-[-0.03em]">{p.title}</h1>
      <p className="mt-2 text-[14px] text-ink-3">Last updated {new Date(p.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
      <div className="mt-8">
        <Markdown source={p.content} />
      </div>
    </article>
  );
}

import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getPublicSettings } from "@/lib/server-api";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const s = await getPublicSettings();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <SiteHeader name={s["site.name"]} />
      <main id="main">{children}</main>
      <SiteFooter name={s["site.name"]} />
    </>
  );
}

import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { themeScript } from "@/components/theme-toggle";
import { getPublicSettings } from "@/lib/server-api";
import { Providers } from "./providers";
import "./globals.css";

const siteUrl = process.env.WEB_URL ?? "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getPublicSettings();
  const name = s["site.name"];
  return {
    metadataBase: new URL(siteUrl),
    title: { default: s["seo.defaultTitle"], template: `%s · ${name}` },
    description: s["seo.defaultDescription"],
    applicationName: name,
    openGraph: { type: "website", siteName: name, title: s["seo.defaultTitle"], description: s["seo.defaultDescription"] },
    twitter: { card: "summary_large_image" },
    alternates: { canonical: "/" },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0e0d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="grain min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

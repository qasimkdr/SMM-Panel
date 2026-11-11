import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const cols = [
  { title: "Product", links: [["Services", "/services"], ["API docs", "/api-docs"], ["Create account", "/register"]] },
  { title: "Support", links: [["FAQ", "/#faq"], ["Sign in", "/login"], ["Reset password", "/forgot-password"]] },
  { title: "Legal", links: [["Terms", "/terms"], ["Privacy", "/privacy"], ["Refund policy", "/refund"]] },
];

export function SiteFooter({ name }: { name: string }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo name={name} />
          <p className="mt-3 max-w-xs text-sm text-ink-3">Social media services with live tracking, refills and an API for resellers.</p>
          <ThemeToggle className="mt-5" />
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-sm font-medium">{c.title}</p>
            <ul className="mt-3 space-y-2">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href!} className="text-sm text-ink-3 transition-colors hover:text-ink">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-ink-3 sm:px-6">
          © {new Date().getFullYear()} {name}. Not affiliated with any social network.
        </p>
      </div>
    </footer>
  );
}

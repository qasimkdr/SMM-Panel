import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <p className="font-mono text-sm text-ink-3">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-ink-3">The link may be old, or the page has moved.</p>
        <Link href="/" className={buttonClass("secondary", "md", "mt-6")}>
          Back to home
        </Link>
      </div>
    </main>
  );
}

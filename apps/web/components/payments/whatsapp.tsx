"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { whatsappLink } from "@smm/shared";
import { TiltCard } from "@/components/ui/tilt-card";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks/queries";
import { cn } from "@/lib/cn";

/** WhatsApp glyph (Simple Icons, CC0). */
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

/** "+92 316 3273012" for Pakistani numbers, "+<digits>" otherwise. */
export function formatPhone(digits: string) {
  if (/^92\d{10}$/.test(digits)) return `+92 ${digits.slice(2, 5)} ${digits.slice(5)}`;
  return `+${digits}`;
}

/** The admin's WhatsApp settings plus a pre-filled message that names the customer. */
export function useWhatsApp() {
  const settings = useQuery({ queryKey: ["public-settings"], queryFn: () => api<Record<string, unknown>>("/settings"), staleTime: 60_000 });
  const me = useMe();
  const number = String(settings.data?.["support.whatsapp"] ?? "").replace(/\D/g, "");
  if (!number) return null;
  const base = String(settings.data?.["support.whatsappMessage"] ?? "").trim();
  const message = [base, me.data ? `(Username: ${me.data.username})` : ""].filter(Boolean).join(" ");
  return { number, href: whatsappLink(number, message), floating: settings.data?.["support.whatsappFloating"] !== false };
}

/** Big 3D card on the Add funds page. */
export function WhatsAppCard({ className }: { className?: string }) {
  const wa = useWhatsApp();
  if (!wa) return null;
  return (
    <TiltCard max={7} className={cn("wa-card overflow-hidden p-6", className)}>
      <div aria-hidden className="wa-card-glow" />
      <div className="relative flex items-start gap-4" style={{ transformStyle: "preserve-3d" }}>
        <span className="wa-badge depth-2 grid size-14 shrink-0 place-items-center rounded-2xl">
          <WhatsAppIcon className="size-7" />
        </span>
        <div className="depth-1 min-w-0">
          <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Pay another way on WhatsApp</h2>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-3">Message us and our team will add balance to your account for you.</p>
          <p className="mt-2 font-mono text-[14px] font-medium tabular-nums text-ink-2">{formatPhone(wa.number)}</p>
        </div>
      </div>
      <a href={wa.href} target="_blank" rel="noopener noreferrer" className="wa-button depth-1 relative mt-5 flex h-12 items-center justify-center gap-2.5 rounded-[13px] px-4 text-[15px] font-semibold">
        <WhatsAppIcon className="size-5" /> Chat on WhatsApp
        <ArrowUpRight className="size-4" aria-hidden />
        <span className="sr-only">(opens WhatsApp)</span>
      </a>
    </TiltCard>
  );
}

/** Floating button in the customer dashboard; fades in after the page settles. */
export function WhatsAppFab() {
  const wa = useWhatsApp();
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {wa?.floating && (
        <motion.a
          key="wa-fab"
          href={wa.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with us on WhatsApp (opens WhatsApp)"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 16 }}
          transition={{ delay: 0.8, type: "spring", stiffness: 420, damping: 26 }}
          className="group fixed bottom-5 right-5 z-30 flex items-center sm:bottom-6 sm:right-6"
        >
          <span
            aria-hidden
            className="pointer-events-none mr-3 hidden translate-x-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink opacity-0 shadow-2 transition-[opacity,transform] duration-300 ease-[var(--ease-out-soft)] group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 sm:block"
          >
            Need help adding funds?
          </span>
          <span className="wa-fab relative grid size-14 place-items-center rounded-full">
            <span aria-hidden className="wa-fab-ring" />
            <WhatsAppIcon className="relative size-7" />
          </span>
        </motion.a>
      )}
    </AnimatePresence>
  );
}

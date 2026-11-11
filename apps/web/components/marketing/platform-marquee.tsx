import { PlatformIcon, platformMeta } from "@/components/platform-icon";

const list = ["instagram", "tiktok", "youtube", "facebook", "twitter", "telegram", "spotify", "twitch", "linkedin", "discord", "threads", "website"];

export function PlatformMarquee() {
  const items = [...list, ...list];
  return (
    <div className="group relative overflow-hidden border-y border-line bg-surface-2 py-5 [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
      <ul className="flex w-max animate-marquee gap-10 group-hover:[animation-play-state:paused]" aria-label="Supported platforms">
        {items.map((p, i) => (
          <li key={`${p}-${i}`} aria-hidden={i >= list.length} className="flex items-center gap-2.5 text-ink-3">
            <PlatformIcon platform={p} className="size-4" />
            <span className="text-sm font-medium whitespace-nowrap">{platformMeta[p]!.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

import {
  AtSign,
  AudioLines,
  Briefcase,
  Camera,
  Gamepad2,
  Ghost,
  Globe,
  MessagesSquare,
  Music2,
  Play,
  Send,
  Shapes,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";

export const platformMeta: Record<string, { label: string; icon: LucideIcon }> = {
  instagram: { label: "Instagram", icon: Camera },
  tiktok: { label: "TikTok", icon: Music2 },
  youtube: { label: "YouTube", icon: Play },
  facebook: { label: "Facebook", icon: ThumbsUp },
  twitter: { label: "X / Twitter", icon: AtSign },
  telegram: { label: "Telegram", icon: Send },
  spotify: { label: "Spotify", icon: AudioLines },
  twitch: { label: "Twitch", icon: Gamepad2 },
  linkedin: { label: "LinkedIn", icon: Briefcase },
  discord: { label: "Discord", icon: MessagesSquare },
  threads: { label: "Threads", icon: AtSign },
  snapchat: { label: "Snapchat", icon: Ghost },
  website: { label: "Website traffic", icon: Globe },
  other: { label: "Other", icon: Shapes },
};

export function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const Icon = (platformMeta[platform] ?? platformMeta.other)!.icon;
  return <Icon className={className} aria-hidden />;
}

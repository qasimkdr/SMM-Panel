import "server-only";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/** Server-side fetch for public data, cached by Next (ISR). Fails soft so pages still render. */
export async function serverGet<T>(path: string, fallback: T, revalidate = 300): Promise<T> {
  try {
    const res = await fetch(`${API_URL}/api${path}`, { next: { revalidate } });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export interface PublicSettings {
  "site.name": string;
  "site.tagline": string;
  "seo.defaultTitle": string;
  "seo.defaultDescription": string;
  "auth.registrationOpen": boolean;
  "features.addFunds": boolean;
  [k: string]: unknown;
}

export const getPublicSettings = () =>
  serverGet<PublicSettings>("/settings", {
    "site.name": process.env.APP_NAME ?? "Panel",
    "site.tagline": "Social growth services, delivered on time.",
    "seo.defaultTitle": "Panel — Social media growth services",
    "seo.defaultDescription": "Fast, reliable social media services with live order tracking, refill guarantees and an API for resellers.",
    "auth.registrationOpen": true,
    "features.addFunds": false,
  });

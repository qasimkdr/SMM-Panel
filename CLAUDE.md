# Project decisions (keep these unless the owner changes them)

## Stack
- **Frontend:** Next.js (App Router, TypeScript) + Tailwind CSS + lucide-react icons
- **Animation:** Motion for fades and page transitions. CSS 3D transforms for tilt, hover and press effects. The landing hero is a CSS 3D scene (no WebGL) for speed; React Three Fiber is allowed only if a future hero needs it, and must be lazy-loaded and never used in the dashboard.
- **Backend:** Node.js + Express (TypeScript), stateless and horizontally scalable
- **Database:** MySQL 8 (InnoDB) via Drizzle ORM
- **Cache, queues, rate limits, pub/sub:** Redis + BullMQ
- **Validation:** Zod schemas shared between web, api and worker
- **Repo layout:** pnpm monorepo with `apps/web`, `apps/api`, `apps/worker`, `packages/db`, `packages/shared`

## Design rules
- It must not look AI-generated. No default purple gradients, no generic glassmorphism, no emoji icons, no stock "hero + 3 cards" layout.
- Normal, calm colors: a neutral base (stone/zinc) with one brand accent. Light and dark mode.
- Smooth 3D: tilt cards, depth on hover, press-in on active, fade in/out, staggered reveals.
- Animate only `transform` and `opacity` (GPU). Respect `prefers-reduced-motion`.
- Use the installed design skills (design-system, ux-copy, accessibility-review, design-critique) on screens.

## Performance rules
- Only workers call provider APIs, never a web request. Batch status checks (100 orders per call).
- The services catalog is served from Redis and rebuilt only when it changes.
- Every balance change happens in one DB transaction with `SELECT ... FOR UPDATE` and writes a ledger row.
- Lists use cursor pagination, not OFFSET. Every hot query needs an index.
- Public pages use SSG/ISR for SEO. Dashboard data comes through TanStack Query with sensible `staleTime`.

## Owner decisions (confirmed)
- **Admin panel** lives on its own subdomain: `admin.<domain>`, with the customer site on `<domain>`. Same Next.js app, routed by host in middleware. The admin session cookie is scoped to the admin host only.
- **Currencies:** users pick a display currency (USD, EUR, GBP, PKR, INR, AED, SAR, TRY, BDT, NGN, IDR, BRL…). Admins enable/disable currencies. Rates update automatically each day, with a manual override per currency. **USD is the base currency for all stored money** (DECIMAL, never float); conversion happens on the backend.
- **Commission / markup (core feature):** the admin types a number (e.g. `25`) and it means 25 %. Levels, from highest to lowest priority: service override > category > provider > global default. User price = provider rate × (1 + % / 100), then any VIP/custom-rate discount. **Calculated only on the backend**, cached in Redis, and recalculated on every sync. Users never see provider cost; admins see cost, commission and profit.
- **Affiliates, VIP tiers, coupons, custom rates, child panels:** in scope.
- **Admin controls everything** from the admin dashboard (see FEATURES.md §12). No setting should require editing code or env files, except secrets.
- **Hosting:** Cloudflare free plan in front (DNS, SSL, CDN, WAF, DDoS), with the app on one low-cost or free VPS using Docker Compose (see ARCHITECTURE.md §7). Must stay cheap until revenue grows.
- **Frontend quality:** no compromises. Run the design skills on every screen.

## Defaults chosen by the owner ("use your defaults")
- **Brand:** placeholder name "Panel" (editable in admin settings `site.name`) until a domain is bought.
- **Palette:** warm paper & ink neutrals + ember accent (`#c4461c` light / `#f07a4e` dark). See `docs/DESIGN_SYSTEM.md`.
- **Language:** English at launch; structure ready for i18n later.
- **Default global commission:** 20 %.
- **Email:** Resend free tier for verification and password-reset emails.
- **Sign-in:** email + password now; Google sign-in planned (setting `auth.googleEnabled`).
- **Server:** start on Oracle Cloud Always Free, move to Hetzner when revenue allows.

## How to run locally
- Requirements: Node 22+, pnpm, MySQL 8, Redis.
- `cp .env.example .env`, then `pnpm install && pnpm db:migrate && pnpm db:seed`.
- `pnpm dev` starts web (:3000), api (:4000) and worker. Admin panel: http://admin.localhost:3000.

## Maintenance rule
- Keep this file, `docs/FEATURES.md` and `docs/ARCHITECTURE.md` updated whenever the owner makes a new decision.

## Deferred for now
- Add funds page: shows "Coming soon". Admins add balance manually meanwhile.
- Telegram features (bot and alerts): not built yet (owner confirmed).

See `docs/FEATURES.md` and `docs/ARCHITECTURE.md`.

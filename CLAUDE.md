# Project decisions (keep these unless the owner changes them)

## Stack
- **Frontend:** Next.js (App Router, TypeScript) + Tailwind CSS + lucide-react icons
- **Animation:** Motion (framer-motion) for fades and page transitions. CSS 3D transforms for the tilt/hover/active card effects. React Three Fiber only for the landing hero, lazy-loaded, never in the dashboard.
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

## Deferred for now
- Add funds page: shows "Coming soon". Admins add balance manually meanwhile.
- Telegram features (bot and alerts): not built yet.

See `docs/FEATURES.md` and `docs/ARCHITECTURE.md`.

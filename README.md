# SMM Panel

A fast, modern SMM panel: Next.js + Express + MySQL + Redis.

- **Docs:** [features](docs/FEATURES.md) · [architecture](docs/ARCHITECTURE.md) · [design system](docs/DESIGN_SYSTEM.md) · [roadmap](docs/ROADMAP.md)
- **Project rules:** [CLAUDE.md](CLAUDE.md)

## Quick start
```bash
cp .env.example .env          # fill in secrets
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev                      # web :3000 · api :4000 · worker
```
- Customer site: http://localhost:3000
- Admin panel: http://admin.localhost:3000 (seeded admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`)

## Production
`docker compose up -d --build` on one VPS, with Cloudflare (free) in front. See `docs/ARCHITECTURE.md` §7.

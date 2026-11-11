# Build roadmap & status

## ✅ Step 1: Foundation (done)
- Monorepo (pnpm): `apps/web`, `apps/api`, `apps/worker`, `packages/db`, `packages/shared`
- MySQL schema for all core features (users, ledger, providers, categories, services, orders, refills, currencies, VIP tiers, coupons, affiliates, tickets, notifications, pages, settings, audit logs, child panels)
- Commission engine with tests (service > category > provider > global; integer money maths)
- API: register/login/refresh/logout, email verification and password reset (Resend), admin-host scope, Redis rate limits, cached catalog and settings, admin commission endpoints, manual balance adjustments through the ledger
- Web: design system, landing page with CSS 3D hero, services page (ISR), API docs, auth pages, user dashboard shell (overview, services, account, add funds "coming soon"), admin login and Commission page
- Worker: BullMQ with daily currency-rate refresh
- Deploy files: Docker Compose, Dockerfiles, nginx config for Cloudflare

## ⏭️ Step 2: Providers & catalog (next)
- Provider CRUD with encrypted keys, test connection, balance
- API v2 driver + configurable custom driver
- Import wizard (bulk by category) and scheduled sync with repricing
- Admin services and categories management

## Step 3: Orders
- New order page (all service types, drip-feed), mass order
- Order worker (send to provider, retries), batched status poller, automatic refunds
- Live updates (SSE), orders page, refill and cancel
- Reseller API `/api/v2`

## Step 4: Admin control center
- Users (search, balance, custom rates, ban, log in as user), orders management, reports dashboard
- Settings (all keys editable), currencies, VIP tiers, content/SEO pages, announcements
- Staff roles, audit log viewer, queue dashboard

## Step 5: Growth features
- Affiliates, coupons, notifications, support tickets, Google sign-in, 2FA
- Child panels

## Deferred
- Payment gateways (add funds), Telegram bot/alerts

# Build roadmap & status

## ✅ Step 1: Foundation (done)
- Monorepo (pnpm): `apps/web`, `apps/api`, `apps/worker`, `packages/db`, `packages/shared`
- MySQL schema for all core features (users, ledger, providers, categories, services, orders, refills, currencies, VIP tiers, coupons, affiliates, tickets, notifications, pages, settings, audit logs, child panels)
- Commission engine with tests (service > category > provider > global; integer money maths)
- API: register/login/refresh/logout, email verification and password reset (Resend), admin-host scope, Redis rate limits, cached catalog and settings, admin commission endpoints, manual balance adjustments through the ledger
- Web: design system, landing page with CSS 3D hero, services page (ISR), API docs, auth pages, user dashboard shell (overview, services, account, add funds "coming soon"), admin login and Commission page
- Worker: BullMQ with daily currency-rate refresh
- Deploy files: Docker Compose, Dockerfiles, nginx config for Cloudflare

## ✅ Step 2: Providers & catalog (done)
- Provider CRUD with AES-256-GCM encrypted keys (only last 4 chars ever shown), test connection, balance
- Drivers: standard API v2 + configurable custom/"v3" driver (auth location, action/field names, wrapped lists, status map)
- Provider calls happen only in the worker; the API queues a job and waits for the result (BullMQ)
- Import wizard: browse the provider list by category, preview prices at your commission, import in bulk into the
  provider's categories (auto-created, platform guessed) or one of yours
- Scheduled sync per provider interval: updates costs and limits, hides services the provider removed, logs price
  history, reprices with the commission engine, refreshes the public catalog; provider currency → USD conversion
- Admin Services: filters, cursor pagination, cost/price/profit, commission source, visibility toggle, bulk show/hide,
  move, commission and delete (services with orders are hidden instead), side-panel editor with price history,
  manual (own) services with fixed prices
- Admin Categories: drag to reorder, inline rename, platform icon, visibility, delete when empty
- `scripts/mock-provider.mjs`: local fake API v2 provider for development
- Accessibility: axe scan (WCAG 2.1 AA) 0 violations on all admin screens in light and dark; dialogs trap focus,
  close on Esc and return focus to the trigger

## ✅ Step 3: Orders (done)
- Shared order rules for all 16 service types (`ORDER_FIELDS`, `normalizeOrder`), used by both the form and the API
- Placing an order: server-side price (commission + VIP/custom discount), one transaction (order → row-locked debit →
  ledger), idempotency keys (double-clicks/retries = one order), active-duplicate block, email-verified check
- Worker: sends orders to providers (atomic claim so a cancel can't race it), backup-provider fallback, retries with
  backoff; provider refusal → full refund; provider out of funds → "Needs attention" for the admin (customer not refunded
  automatically, admin resends or cancels)
- Status poller: 100 orders per provider call, oldest-checked first, never overlapping; partial/canceled refunds via
  idempotent `settleOrder()` (never refunds twice); rolling average completion time per service
- Refills (one per order per 24 h, within the refill period) and cancels (local + refund if not yet sent, otherwise
  asked of the provider)
- Live updates: Server-Sent Events, one Redis pattern subscription per API process fanned out to tabs
- Customer UI: new order (search, platform chips, dynamic fields, drip-feed, live total, balance after), mass order,
  orders page with status tabs, search, progress bars, refill/cancel, live updates; recent orders on the overview;
  "Order" buttons on the services list; API key regenerate
- Reseller API `/api/v2`: services, add, status (single/multi), refill (single/multi), refill_status, cancel, balance;
  per-key limit 600/min; v2-style errors
- Admin Orders: status tabs, manual queue, search, customer, charge/refund, profit, provider order ID, errors,
  actions (in progress, complete, partial with refund, start count, resend, cancel and refund)
- Tested: 20 simultaneous orders on a small balance → exactly as many succeed as the balance covers, never negative;
  partial refund math; idempotent retries; v2 responses; axe 0 violations on all order screens

## Known follow-ups
- An order claimed by the worker whose provider call crashed mid-flight stays "Processing" without a provider ID; it
  shows in Admin → Orders for a manual resend/cancel (not auto-resent, to avoid double orders at the provider).
- Local drip-feed emulation for providers without native drip-feed (currently only offered where the provider supports it).

## ✅ Step 4: Admin control center (done)
- Dashboard: revenue (after refunds), profit, orders, new customers for today and 7/30/90 days; revenue + profit line
  chart (one $ axis, crosshair tooltip, legend + end labels, table view); orders-per-day bars; top services; alerts for
  orders needing attention, manual queue and provider problems; customer balances held. Cached 60 s. Chart colors
  validated for colorblind safety and contrast in light and dark (`--viz-1`, `--viz-2`).
- Users: prefix search, filters (staff/admin/banned), detail panel with stats, balance add/deduct (ledger), VIP level
  (auto or locked), personal discount, API access, email confirmed, private notes, ban with reason (signs out
  everywhere, kills API key cache), sign out everywhere, "sign in as user" (one-time 60 s link, audited), balance
  history, recent sign-ins; role + staff permissions (admins only)
- Staff permissions: orders, users, catalog, pricing, content, settings, logs. Enforced per admin route against the DB
  (a demoted account loses access immediately), and the admin menu hides what a staff member can't use.
- Settings: one shared registry (`packages/shared/src/settings.ts`) drives the form and the validation; grouped
  sections; unsaved-changes bar; public pages refresh when settings change. Maintenance mode pauses new orders and
  shows a notice to customers.
- Currencies: enable/disable, automatic vs manual rate (typing a rate switches to manual), "update rates now"
- VIP levels: edit name, spend threshold, discount, color; customers re-assigned in one SQL update
- Pages & notices: Terms/Privacy/Refund editor with preview (safe Markdown renderer, no HTML injection), published at
  /terms, /privacy, /refund with ISR; notices as dashboard banners, one-time pop-ups or news, with start/end times
- Activity log: every admin action, filterable by area, with details
- axe: 0 WCAG AA violations on all new screens in light and dark

## ✅ Step 5: Growth features (done)
- Support tickets: customers open/reply/close (max 10 open, rate-limited); admin inbox (oldest waiting first),
  conversation view, saved replies, reply-and-close, reopen; new `support` staff permission
- Notifications: in-app bell with unread count (order final states, ticket replies, affiliate commission, child
  panels, payouts); emails through a worker-only queue (Resend, retries, 8/s limit) with per-customer preferences
  (orders, tickets, news); admin manual order actions notify too
- Affiliates: `/r/<code>` link (visit counted once per IP per day, code remembered 30 days), commission credited once
  per order when it completes or partially completes, on the amount actually paid after refunds (inside the same
  transaction as settlement); move to balance instantly or request a payout (admin approves/declines; declines
  return the money); conditional UPDATE prevents double withdrawals
- Promo codes: balance codes with total and per-customer limits and expiry; coupon row locked during redemption so
  limits are exact under a rush; redeem box on Add funds; admin create/disable
- Security: TOTP two-factor (built-in RFC 6238, verified against the official test vector), QR setup, 8 one-time
  recovery codes (stored hashed), 2FA step on password and Google sign-in, disable needs password + code; signed-in
  devices with remote sign-out; recent sign-ins; email preferences
- Google sign-in: OAuth code flow with single-use state, links by verified email, creates accounts (keeps referral),
  respects 2FA, ban and sign-up settings. Needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET and the setting turned on.
- Child panels: order (first month charged in the same transaction), admin marks Live (30-day period starts),
  daily renewal from balance or suspension at expiry with notifications; auto-renew toggle
- Daily cleanup job: expired sessions/tokens and old read notifications
- Tested end-to-end (referral → commission → payout race, coupon race, tickets, 2FA incl. recovery codes, sessions,
  renewals/suspension); axe 0 violations on all new screens in light and dark; no horizontal scroll on phones

## ⏳ Step 6: Going live (in progress)
- ✅ Deploy files: shared API/worker image (`deploy/Dockerfile.node`), web image, production `docker-compose.yml`
  (MySQL, Redis, one-shot migrate+seed, 2 API replicas, worker, web, nginx, Cloudflare Tunnel; no public ports),
  nginx config (validated with `nginx -t`), server setup script, nightly backup script (rclone off-site)
- ✅ Production builds verified locally: API and worker bundles start and serve the live database
- ✅ Go-live guide: `docs/DEPLOY.md` (free tier everywhere, API keys list, troubleshooting)
- ⏭️ First real Docker build on the server, real provider and email tests, load test, automated tests for money paths

## Deferred
- Payment gateways (add funds), Telegram bot/alerts

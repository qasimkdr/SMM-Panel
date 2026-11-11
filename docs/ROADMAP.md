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

## Step 4: Admin control center
- Users (search, balance, custom rates, ban, log in as user), orders management, reports dashboard
- Settings (all keys editable), currencies, VIP tiers, content/SEO pages, announcements
- Staff roles, audit log viewer, queue dashboard

## Step 5: Growth features
- Affiliates, coupons, notifications, support tickets, Google sign-in, 2FA
- Child panels

## Deferred
- Payment gateways (add funds), Telegram bot/alerts

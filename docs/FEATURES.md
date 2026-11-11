# SMM Panel — Complete Feature Specification

## 0. What an SMM panel is

An **SMM (Social Media Marketing) panel** is a web store where customers buy
social media services (followers, likes, views, comments, subscribers, plays,
reviews, traffic) for platforms such as Instagram, TikTok, YouTube, Facebook,
X/Twitter, Telegram, Spotify, Twitch and websites.

Most panels **resell**. They buy services from upstream **providers**
(other panels) over a standard HTTP API, add a margin, and sell to their own
users. Many panels also offer:

* **Self-created (manual) services:** fulfilled by your own team or your own
  automation, with no upstream provider.
* **A reseller API:** your customers (often other panels) can call **your**
  API, so you become someone else's provider.
* **Child panels:** you rent white-label copies of your panel to resellers.

```
Customer ──► Your Panel ──► Provider A (API v2)
   ▲             │      └─► Provider B (API v2 / custom "v3")
   │             └────────► Manual / self-fulfilled queue (staff or own bots)
Reseller ──► Your API v2 ──┘
```

Priority tags used below: **[MVP]** must ship at launch · **[P2]** soon after launch · **[P3]** growth / nice to have.

---

## 1. Service sources

### 1.1 Provider (API) services **[MVP]**
* Add unlimited providers: name, API URL, API key, API type (`v2`, `v3/custom`), status, notes.
* Show the provider's balance (via `action=balance`), with a low-balance alert.
* **Import services** from a provider (`action=services`):
  * Browse the provider's list with filters (category, search, min/max, rate).
  * Import one by one, or in bulk by category.
  * Map each one to your own category, name and description.
  * Pricing rule on import: fixed price, a % markup, or a fixed markup added to the provider rate.
  * Keep the provider service ID, rate, min, max, type, refill and cancel flags.
* **Auto-sync job** (cron, e.g. every 1–6 h):
  * Update provider rates, then reprice using your markup rule (optional per service).
  * Disable the service locally when the provider removes or disables it.
  * Log changes and notify the admin (rate went up, service removed).
  * Option to keep a **custom name and description** so a sync never overwrites them.
* **Failover / backup provider** per service **[P2]**: if provider A errors or runs out of balance, send the order to provider B.
* **Drip-feed** support. Use the provider's drip-feed when it has one, or emulate it locally with runs and an interval.

### 1.2 Self-created / manual services **[MVP]**
* Create a service with no provider. Set the name, category, rate per 1000, min, max, type, description, average time, refill and cancel options.
* Orders go to a **manual queue**. Staff mark them `In progress`, `Partial` (with a remains count), `Completed` or `Canceled`.
* Optional **start count** field (staff enter it, or it's fetched automatically for supported platforms **[P3]**).
* **Internal provider / automation hook** **[P2]**: a manual service can call your own script or bot through a webhook. That lets you build your own fulfillment while the panel treats it like any other provider.

### 1.3 Service types (match the standard API v2 types)
| Type | Fields the customer submits |
|---|---|
| Default | link, quantity |
| Package | link (fixed quantity) |
| Custom Comments | link, comments (one per line; quantity = number of lines) |
| Custom Comments Package | link, comments |
| Mentions (custom list / hashtag / user followers) | link, usernames / hashtag / username |
| Comment Likes | link, username |
| Poll | link, quantity, answer_number |
| Subscriptions (auto likes/views on new posts) | username, min, max, posts, old_posts, delay, expiry |
| Drip-feed (flag on Default) | link, quantity, runs, interval |
| Invites from groups | link, quantity, groups |
| SEO / web traffic | link, quantity, country, device, type_of_traffic, google_keyword |

### 1.4 API protocol support
**API v2 (the de-facto standard, used by almost every panel)**: `POST` form data to one endpoint, e.g. `https://provider.com/api/v2`.

| action | params | response |
|---|---|---|
| `services` | key | `[{service, name, type, category, rate, min, max, refill, cancel}]` |
| `add` | key, service, link, quantity (+ type-specific fields) | `{order: 123}` or `{error: "..."}` |
| `status` | key, order | `{charge, start_count, status, remains, currency}` |
| `status` (multi) | key, orders=1,2,3 (≤100) | `{ "1": {...}, "2": {...} }` |
| `refill` | key, order **or** orders | `{refill: 1}` |
| `refill_status` | key, refill **or** refills | `{status: "Completed"}` |
| `cancel` | key, orders | `[{order, cancel: 1 | {error}}]` |
| `balance` | key | `{balance: "100.84", currency: "USD"}` |

Status values: `Pending`, `In progress`, `Processing`, `Completed`, `Partial`, `Canceled`.

**"v3" / custom APIs**: there is no single official "v3". Some providers use JSON bodies, bearer tokens, different action names or different field names. Build it as **driver/adapter classes**:
* `ProviderDriver` interface: `getServices()`, `placeOrder()`, `getStatus()`, `getStatuses()`, `refill()`, `refillStatus()`, `cancel()`, `getBalance()`.
* `V2Driver` (form data, `key` param) covers about 95 % of providers.
* `V3Driver` / `CustomDriver`: configurable per provider (HTTP method, JSON or form, auth header or param, field mapping, status mapping). That way a new API style is configuration, not code.
* Normalize every response to one internal model, so the rest of the panel doesn't care which driver handled it.

### 1.5 Order sync engine **[MVP]**
* Queue worker (Redis / DB queue): place orders asynchronously and retry failures with backoff.
* Status poller: batch `status` calls (100 orders per call) every 1–5 min for non-final orders.
* On `Partial` or `Canceled`: **automatically refund** the unused amount to the user's balance (`charge × remains / quantity`).
* On provider error: mark the order `Fail` with the error text. The admin can resend (to the same or a different provider), refund or cancel.
* Store the provider order ID, provider charge, your charge and the **profit per order**.
* Duplicate protection: block a new order with the same link and service while an earlier one is still active (configurable).

---

## 2. Customer (user) side

### 2.1 Account **[MVP]**
* Sign up, log in, log out, forgot/reset password, email verification.
* Optional Google sign-in **[P2]**, 2FA (TOTP) **[P2]**, CAPTCHA (reCAPTCHA / hCaptcha / Turnstile) on auth forms.
* Profile: name, email, password change, timezone, language, currency.
* API key: view and regenerate.
* Login history and active sessions **[P2]**.

### 2.2 New order **[MVP]**
* Category, then service dropdowns with search, plus a **platform filter** (icons for Instagram, TikTok and others).
* Service info panel: description, min/max, rate, average completion time, refill/cancel badges.
* Dynamic fields based on service type (see 1.3).
* Live charge calculation as quantity changes.
* Drip-feed toggle: runs, interval, total quantity.
* Checks: link format per platform, min/max, enough balance.
* **Mass order** **[MVP]**: one order per line in the form `service_id | link | quantity`.
* Favorite services **[P2]**.

### 2.3 Orders **[MVP]**
* List with tabs: All, Pending, In progress, Completed, Partial, Processing, Canceled.
* Columns: ID, date, link, charge, start count, quantity, service, status, remains.
* Search by ID or link. **Refill** and **Cancel** buttons when the service supports them.
* Refill history and refill status page.
* Drip-feed orders page and subscriptions page (for those service types).

### 2.4 Funds / payments **[MVP]**
* Add-funds page with every enabled gateway, plus the min/max per gateway.
* Payment history.
* **Gateways** (pluggable modules):
  * Global: Stripe, PayPal, Payeer, Perfect Money, Coinbase Commerce / Cryptomus / NOWPayments / Plisio (crypto), Binance Pay.
  * Pakistan (if that's your market): JazzCash, Easypaisa, bank transfer. Manual methods use proof-of-payment upload and admin approval.
  * Others as needed: Razorpay/Paytm (India), Payoneer, Skrill, Flutterwave, Paystack.
* Webhook/IPN verification, idempotency (never credit twice) and a fraud flag.
* Bonus: e.g. +X % when adding more than $Y **[P2]**.
* Coupon / redeem codes **[P2]**.
* Multi-currency display with automatic exchange rates. Store everything in one base currency internally.

### 2.5 Support **[MVP]**
* Tickets: subject presets (Order / Payment / Refill / Cancel / Other), order IDs, message, attachments.
* Ticket statuses: Pending, Answered, Closed. Email notification when staff reply.

### 2.6 Other customer pages
* **Services list** (public and logged-in): table with search and filters, plus rate, min, max, average time and description.
* **API docs page** **[MVP]**: shows the API v2 spec from 1.4 for *your* panel, with example code (PHP, Python, Node).
* **Affiliates / referral program** **[P2]**: referral link, visits, sign-ups, commission %, minimum payout, payout requests.
* **Child panel** ordering **[P3]**: domain, currency, admin login, monthly price.
* **Updates / news** page with announcements and service changes.
* Terms, Privacy, Refund policy and FAQ pages (editable from admin).
* Notification bell plus emails (order completed, ticket answered, funds added, low balance).
* Dark/light mode, mobile-first responsive design, multi-language (EN, UR, AR with RTL…) **[P2]**.

---

## 3. Reseller API (your own API v2) **[MVP]**
* Endpoint `/api/v2` that implements **exactly** the v2 actions in 1.4, so other panels can add you as a provider with zero code.
* Authentication by the user's API key. Rate limiting per key and per IP. Optional IP allowlist.
* Per-user custom rates also apply over the API.
* Logs of API requests for debugging **[P2]**.

---

## 4. Admin panel

### 4.1 Dashboard **[MVP]**
* Today / 7 days / 30 days: revenue, profit, orders, new users, deposits.
* Charts (orders and revenue over time), top services, top users.
* Provider balances with low-balance warnings. Count of failed orders.

### 4.2 Users **[MVP]**
* List, search and filter; view and edit; activate/suspend.
* Add or deduct balance with a reason (audit log).
* **Custom rates per user** (per service or % discount), plus user groups / VIP tiers **[P2]**.
* Log in as the user (impersonation, logged).
* View a user's orders, payments, tickets and API key.
* Export to CSV.

### 4.3 Orders **[MVP]**
* All orders with filters: status, service, provider, user, date, mode (auto/manual).
* Bulk actions: resend, change status, set partial, cancel and refund, set start count.
* Order details: request and response log for the provider call.
* Refill requests list. Manual/fail queues.

### 4.4 Services & categories **[MVP]**
* Categories: create, sort by drag and drop, set an icon/platform, enable/disable.
* Services: create manual or provider services, edit, duplicate, bulk-edit prices (± % per category), enable/disable, sort.
* Fields: name, description (rich text), category, type, provider + provider service ID, rate, min, max, refill (yes/no plus refill days), cancel, drip-feed allowed, average time (calculated automatically from completed orders **[P2]**), dripfeed/overflow %.
* Provider import wizard and sync settings (see 1.1).

### 4.5 Providers **[MVP]**
* CRUD, driver type, test connection, balance, last sync, error rate.

### 4.6 Payments **[MVP]**
* Payment log; approve or reject manual payments; enable/configure gateways (keys, min/max, fee %, bonus).

### 4.7 Tickets **[MVP]**
* Inbox, assign to staff, canned replies, close, and quick actions (refill/cancel the referenced order).

### 4.8 Staff & permissions **[P2]**
* Admin accounts with roles (Super admin, Support, Order manager, Finance) and granular permissions.
* Activity / audit log of every admin action.

### 4.9 Reports **[P2]**
* Profit by service, provider, user and day. Payments by gateway. Export CSV/Excel.

### 4.10 Appearance & content **[MVP]**
* Site name, logo, favicon, colors / theme, landing page sections.
* Page editor (Terms, FAQ, API, landing). Blog **[P3]**.
* Menu editor, custom header/footer code (analytics, chat widgets such as Tawk/Crisp/WhatsApp button).
* SEO: meta titles and descriptions, sitemap.xml, robots.txt.

### 4.11 Settings **[MVP]**
* General: currency, timezone, default language, maintenance mode.
* Sign-up: open/closed, email verification, CAPTCHA, default user rates.
* Email: SMTP, editable templates.
* Notifications: admin alerts via email / **Telegram bot** (new order, new payment, new ticket, provider low balance, failed order).
* Security: IP blocklist, rate limits, password policy.
* Cron / queue health status.

### 4.12 Marketing **[P2–P3]**
* Coupons, deposit bonuses, affiliate settings, broadcast announcements / email campaigns, popup notices.

### 4.13 Child panels **[P3]**
* Sell and manage child panels (multi-tenant): domain, plan, expiry, suspend. Each child panel uses your panel as its default provider.

---

## 5. Background jobs (cron / queue)
| Job | Frequency |
|---|---|
| Send pending orders to providers | continuous worker |
| Poll order statuses (batched) | 1–5 min |
| Poll refill statuses | 10–30 min |
| Drip-feed runner (local emulation) | 1 min |
| Sync provider services and prices | 1–6 h |
| Fetch provider balances, then alert | 15–30 min |
| Auto-refund Partial/Canceled | on status change |
| Currency rate update | daily |
| Average-time calculation | hourly |
| Clean-up of logs and sessions | daily |
| DB backup | daily |

---

## 6. Security & reliability (required to go live)
* HTTPS everywhere, behind Cloudflare (DDoS protection; panels get attacked a lot).
* Passwords hashed (bcrypt/argon2). API keys stored as random 32+ char strings.
* CSRF protection, input validation, prepared statements / ORM (SQL injection), XSS escaping.
* Rate limits on login, sign-up, add-funds, ticket and API endpoints.
* **Database transactions plus row locks on balance changes**, so two parallel orders can't overspend.
* A ledger table for every balance movement (deposit, order, refund, admin adjustment, referral payout) so balances are auditable.
* Idempotent payment webhooks, and signature verification on every gateway.
* Provider API keys encrypted at rest.
* Error monitoring (Sentry), uptime monitoring, daily off-site backups.
* GDPR-style data export/delete, plus cookie consent if you serve the EU.

---

## 7. Suggested data model (core tables)
`users`, `user_sessions`, `user_custom_rates`, `user_groups`,
`categories`, `services`, `providers`, `provider_services` (cached import list),
`orders`, `order_logs`, `refills`, `drip_feeds`, `subscriptions`,
`payments`, `payment_methods`, `transactions` (ledger), `coupons`,
`tickets`, `ticket_messages`, `affiliates`, `affiliate_payouts`,
`admins`, `roles`, `permissions`, `admin_logs`, `settings`, `pages`,
`notifications`, `announcements`, `api_logs`, `child_panels`.

Key `orders` columns: `id, user_id, service_id, provider_id, provider_order_id,
link, quantity, charge, provider_charge, start_count, remains, status, mode
(auto|manual), runs, interval, comments, extra(json), error, created_at, updated_at`.

---

## 8. Suggested tech stack
* **Backend:** Laravel (PHP), the most common choice for SMM panels, with built-in queues and scheduler. Alternative: Node.js (NestJS) + BullMQ.
* **DB:** MySQL/MariaDB or PostgreSQL. **Redis** for queues, cache and rate limits.
* **Frontend:** Blade + Tailwind + Alpine/Livewire (fast to build), or a Next.js/React SPA.
* **Hosting:** VPS (2–4 GB RAM to start) + Nginx + Supervisor (queue workers) + cron, behind Cloudflare.

---

## 9. Launch checklist (MVP scope)
1. Auth + user dashboard + balance ledger
2. Categories / services (manual + provider)
3. Provider drivers (v2 first, then the configurable custom driver) + import + sync
4. New order (all types) + mass order + order list
5. Order worker + status poller + auto-refund + refill/cancel
6. At least 2 payment gateways (1 automatic + 1 manual)
7. Tickets
8. Your own `/api/v2` + API docs page
9. Admin: dashboard, users, orders, services, providers, payments, tickets, settings
10. Email + Telegram notifications, legal pages, Cloudflare, backups

Then P2: affiliates, custom rates/VIP tiers, coupons and bonuses, staff roles, reports, 2FA, failover providers, multi-language.
Then P3: child panels, blog, subscriptions/auto-likes, automatic start-count fetching.

---

## 10. Business & legal notes
* Buying followers or engagement violates the terms of service of most social platforms. Payment processors such as Stripe and PayPal often restrict or close SMM merchants, so plan for crypto and local gateways as backups.
* Publish clear Terms and a refund policy (no refunds for drops after the refill period, and so on).
* Keep the refill guarantee periods realistic and enforce them in code (refill button only within N days of completion).

# Architecture (built for thousands of concurrent users)

## 1. Database choice: **MySQL 8 (InnoDB)**, not MongoDB
An SMM panel is a **money system**. Users have balances; orders debit them; refunds credit them.
* We need ACID transactions and row locks, so two orders placed at the same moment can't overspend a balance. MySQL does this natively and cheaply.
* The data is relational (users → orders → services → providers → payments), and the reports are joins and aggregates (profit per service per day). SQL is built for that.
* MongoDB can do transactions, but they need a replica set and cost more, and you lose strict schemas on financial data.
* MySQL scales comfortably: one well-indexed instance handles millions of orders. Add read replicas later for reports.

(PostgreSQL would be equally good. MySQL is chosen because it's cheaper and simpler to host on most VPS/panels.)

## 2. Layout
```
                Cloudflare (CDN, DDoS, WAF, cache static + ISR pages)
                         │
                       Nginx (TLS, gzip/brotli, reverse proxy)
              ┌──────────┴───────────┐
        apps/web (Next.js)      apps/api (Express) × N   ◄── /api/v2 reseller API
        SSR/SSG/ISR pages        stateless, cluster mode
              │                      │
              └──────────┬───────────┘
                    Redis  ── cache · sessions · rate limits · BullMQ queues · pub/sub
                         │
                apps/worker × N (BullMQ)
                place orders · poll statuses · refills · sync providers · emails
                         │
                    MySQL 8 (primary [+ read replica later])
                         │
                Provider APIs (v2 / custom) ── called ONLY by workers
```

## 3. The fast paths
**Place order (target < 50 ms server time)**
1. Validate with Zod, then read the service and user rate from **Redis** (no DB read).
2. Check the `Idempotency-Key` header, so a double-click or a retry never creates two orders.
3. One DB transaction: `SELECT balance ... FOR UPDATE` → deduct → insert order → insert ledger row → commit.
4. Push a job to the BullMQ `orders` queue, then respond immediately. The provider call happens in the background.

**Order status updates**
* A worker polls providers in **batches of 100** (one HTTP call per 100 orders, per provider), only for non-final orders. A per-provider limiter stops us flooding any provider.
* Changes are written in bulk, then published on Redis pub/sub. The API pushes them to the user's browser over **SSE**, so the browser never polls.

**Services catalog**
* Built once into Redis, both the full list and grouped by category. It's invalidated only when an admin edits a service or a sync changes prices.
* Public services page: Next.js ISR plus Cloudflare cache. Dashboard: one cached request, filtered in the browser (no API call per keystroke).

## 4. Stopping repeated / wasteful calls
* TanStack Query in the browser: request dedupe, `staleTime`, no refetch-on-focus storms.
* ETag / `Cache-Control` on read endpoints.
* Redis cache-aside, with a short-lived lock (single-flight) so 1,000 simultaneous cache misses cause **one** DB query.
* Per-user custom rates are cached in Redis and invalidated on change.
* Counters (dashboard stats) are pre-aggregated by a worker, not computed per request.

## 5. Scaling & safety
* The API is stateless (JWT access token in memory, plus a refresh token in an httpOnly cookie; sessions stored in Redis). Add API containers as traffic grows.
* Rate limits per IP and per user/API key, backed by Redis.
* MySQL connection pool, indexes on every filter column, cursor pagination.
* Queues with retries + exponential backoff + a dead-letter queue. Admin queue dashboard (Bull Board).
* Graceful shutdown, health checks (`/health`, `/ready`).
* Logs with pino, errors in Sentry, optional metrics (Prometheus/Grafana).
* Secrets only in env files. Provider API keys encrypted at rest (AES-256-GCM).
* Deployment: Docker Compose on a VPS (web, api, worker, mysql, redis, nginx). Each piece can later move to its own server.

## 6. Frontend performance & SEO
* Server Components by default; client components only where interactive.
* `next/font` (self-hosted fonts), `next/image`, route-level code splitting.
* The three.js hero is lazy-loaded and only renders when visible, with a static fallback on low-end devices and with reduced motion.
* Animations use only `transform`/`opacity`. Target Lighthouse 95+ and good Core Web Vitals.
* SEO: Metadata API, OpenGraph images, `sitemap.xml`, `robots.txt`, canonical URLs, JSON-LD (Organization, Product/Service, FAQ, Breadcrumb), per-platform landing pages (e.g. `/instagram-services`), and an optional blog.
